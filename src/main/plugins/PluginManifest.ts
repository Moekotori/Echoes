import { basename, extname, normalize, sep } from 'node:path';
import {
  pluginApiVersion,
  pluginPermissions,
  type PluginCommandContribution,
  type PluginManifest,
  type PluginManifestContributes,
  type PluginMetadataProviderContribution,
  type PluginPanelContribution,
  type PluginPermission,
} from '../../shared/types/plugins';

type PluginSettingContribution = NonNullable<PluginManifestContributes['settings']>[number];

const pluginIdPattern = /^[a-z0-9][a-z0-9._-]{1,63}$/u;
const safeRelativePathPattern = /^[^<>:"|?*\u0000-\u001f]+$/u;
const permissionSet = new Set<PluginPermission>(pluginPermissions);

const asText = (value: unknown, field: string, maxLength = 120): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must not be empty`);
  }

  return trimmed.slice(0, maxLength);
};

const normalizePluginId = (value: unknown): string => {
  const id = asText(value, 'id', 64).toLowerCase();
  if (!pluginIdPattern.test(id)) {
    throw new Error('id must use lowercase letters, numbers, dot, dash, or underscore');
  }
  return id;
};

const normalizeRelativeFilePath = (value: unknown, field: string, fallback: string | null): string | undefined => {
  if (value === undefined || value === null) {
    return fallback ?? undefined;
  }

  const input = asText(value, field, 180).replace(/\\/gu, '/');
  const normalized = normalize(input);

  if (
    normalized.startsWith('..') ||
    normalized.includes(`..${sep}`) ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    !safeRelativePathPattern.test(normalized)
  ) {
    throw new Error(`${field} must be a file name inside the plugin folder`);
  }

  return normalized;
};

const normalizePermissions = (value: unknown): PluginPermission[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: PluginPermission[] = [];
  for (const item of value) {
    if (typeof item === 'string' && permissionSet.has(item as PluginPermission) && !normalized.includes(item as PluginPermission)) {
      normalized.push(item as PluginPermission);
    }
  }
  return normalized;
};

const normalizeCommand = (value: unknown): PluginCommandContribution | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Partial<PluginCommandContribution>;
  try {
    return {
      id: normalizePluginId(input.id),
      title: asText(input.title, 'command title', 80),
      description: typeof input.description === 'string' && input.description.trim() ? input.description.trim().slice(0, 180) : undefined,
    };
  } catch {
    return null;
  }
};

const normalizePanel = (value: unknown): PluginPanelContribution | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Partial<PluginPanelContribution>;
  try {
    const path = normalizeRelativeFilePath(input.path, 'panel path', null);
    if (!path || extname(path).toLowerCase() !== '.html') {
      return null;
    }
    return {
      id: normalizePluginId(input.id),
      title: asText(input.title, 'panel title', 80),
      path,
    };
  } catch {
    return null;
  }
};

const normalizeSetting = (item: unknown): PluginSettingContribution | null => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const setting = item as { id?: unknown; title?: unknown; description?: unknown };
  try {
    const normalized: PluginSettingContribution = {
      id: normalizePluginId(setting.id),
      title: asText(setting.title, 'setting title', 80),
    };
    if (typeof setting.description === 'string' && setting.description.trim()) {
      normalized.description = setting.description.trim().slice(0, 180);
    }
    return normalized;
  } catch {
    return null;
  }
};

const normalizeMetadataProvider = (value: unknown): PluginMetadataProviderContribution | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const input = value as Partial<PluginMetadataProviderContribution>;
  try {
    return {
      id: normalizePluginId(input.id),
      title: asText(input.title, 'metadata provider title', 80),
      description: typeof input.description === 'string' && input.description.trim() ? input.description.trim().slice(0, 180) : undefined,
    };
  } catch {
    return null;
  }
};

const normalizeContributes = (value: unknown): PluginManifestContributes => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Partial<PluginManifestContributes>;
  return {
    commands: Array.isArray(input.commands) ? input.commands.map(normalizeCommand).filter((item): item is PluginCommandContribution => Boolean(item)) : [],
    panels: Array.isArray(input.panels) ? input.panels.map(normalizePanel).filter((item): item is PluginPanelContribution => Boolean(item)) : [],
    metadataProviders: Array.isArray(input.metadataProviders)
      ? input.metadataProviders
          .map(normalizeMetadataProvider)
          .filter((item): item is PluginMetadataProviderContribution => Boolean(item))
      : [],
    settings: Array.isArray(input.settings)
      ? input.settings
          .map(normalizeSetting)
          .filter((item): item is PluginSettingContribution => Boolean(item))
      : [],
  };
};

export const normalizePluginManifest = (value: unknown, directoryName = ''): PluginManifest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('manifest must be an object');
  }

  const input = value as Partial<PluginManifest>;
  const id = normalizePluginId(input.id ?? basename(directoryName));
  const apiVersion = Number(input.apiVersion);
  if (!Number.isInteger(apiVersion) || apiVersion < 1 || apiVersion > pluginApiVersion) {
    throw new Error(`apiVersion must be between 1 and ${pluginApiVersion}`);
  }

  const entry = normalizeRelativeFilePath(input.entry, 'entry', 'plugin.js');
  const panel = normalizeRelativeFilePath(input.panel, 'panel', null);
  if (entry && extname(entry).toLowerCase() !== '.js') {
    throw new Error('entry must be a .js file');
  }
  if (panel && extname(panel).toLowerCase() !== '.html') {
    throw new Error('panel must be a .html file');
  }

  return {
    id,
    name: asText(input.name ?? id, 'name', 80),
    version: asText(input.version ?? '0.0.1', 'version', 40),
    apiVersion,
    entry,
    panel,
    permissions: normalizePermissions(input.permissions),
    contributes: normalizeContributes(input.contributes),
  };
};
