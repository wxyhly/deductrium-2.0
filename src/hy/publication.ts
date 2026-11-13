/** Inert, bounded publication data. This module deliberately has no world/runtime imports. */
export const SUPPORTED_ENGINE_VERSION = '2.0';
export interface WorldDependency { id: string; minRevision: number; maxRevision?: number }
export interface WorldPublication {
    author?: string;
    description?: string;
    engineVersion?: string;
    dependencies?: WorldDependency[];
}

/** Shared JSON boundary for publication, library and portable packages; never calls accessors. */
export function publicationJSON(input: unknown): any {
    let nodes = 0, size = 0;
    const ancestors = new Set<object>();
    const clone = (value: unknown, depth: number): any => {
        if (++nodes > 500_000 || depth > 32) throw Error('Publication JSON exceeds size/depth limits');
        if (typeof value === 'string') {
            size += value.length;
            if (size > 8 * 1024 * 1024) throw Error('Publication JSON exceeds 8 MiB');
            return value;
        }
        if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
        if (!value || typeof value !== 'object') throw Error('Publication requires plain JSON');
        const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
        if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
            throw Error('Publication requires a plain JSON prototype');
        if (ancestors.has(value)) throw Error('Cyclic publication JSON');
        ancestors.add(value);
        const result: any = array ? [] : {};
        if (array && value.length > 100_000) throw Error('Publication JSON array too large');
        for (const key of Reflect.ownKeys(value)) {
            if (array && key === 'length') continue;
            if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key))
                throw Error('Forbidden publication JSON key');
            size += key.length;
            if (size > 8 * 1024 * 1024) throw Error('Publication JSON exceeds 8 MiB');
            if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
                throw Error('Invalid publication JSON array property');
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!descriptor.enumerable || !('value' in descriptor)) throw Error('Publication requires JSON data properties');
            result[key] = clone(descriptor.value, depth + 1);
        }
        if (array && (result.length !== value.length || Object.keys(result).length !== value.length))
            throw Error('Sparse publication JSON array');
        ancestors.delete(value);
        return result;
    };
    return clone(input, 0);
}

function fields(value: any, allowed: string[], required: string[], label: string): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Publication: ${label} must be an object`);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw Error(`Publication: unknown ${label} field ${key}`);
    for (const key of required) if (!Object.hasOwn(value, key)) throw Error(`Publication: missing ${label}.${key}`);
}

/** Missing publication is valid for legacy manifests. All supplied fields are strictly checked. */
export function validatePublication(value: unknown, worldId?: string): WorldPublication {
    if (value === undefined) return {};
    const publication = publicationJSON(value);
    fields(publication, ['author', 'description', 'engineVersion', 'dependencies'], [], 'metadata');
    for (const [key, limit] of [['author', 200], ['description', 8000]] as const) {
        if (Object.hasOwn(publication, key) && (typeof publication[key] !== 'string' || publication[key].length > limit))
            throw Error(`Publication: ${key} must be a string of at most ${limit} characters`);
    }
    if (Object.hasOwn(publication, 'engineVersion')) {
        const version = publication.engineVersion;
        if (typeof version !== 'string' || version.length > 32 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(version))
            throw Error('Publication: engineVersion must be major.minor or major.minor.patch');
        if (version.split('.')[0] !== SUPPORTED_ENGINE_VERSION.split('.')[0])
            throw Error(`Incompatible engine version ${version}; supported engine is ${SUPPORTED_ENGINE_VERSION} (major 2)`);
    }
    if (Object.hasOwn(publication, 'dependencies')) {
        if (!Array.isArray(publication.dependencies) || publication.dependencies.length > 32)
            throw Error('Publication: dependencies must contain at most 32 entries');
        const ids = new Set<string>();
        for (const dependency of publication.dependencies) {
            fields(dependency, ['id', 'minRevision', 'maxRevision'], ['id', 'minRevision'], 'dependency');
            if (typeof dependency.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(dependency.id))
                throw Error('Publication: invalid dependency ID');
            if (dependency.id === worldId) throw Error(`Publication: world ${worldId} cannot depend on itself`);
            if (ids.has(dependency.id)) throw Error(`Publication: duplicate dependency ${dependency.id}`);
            ids.add(dependency.id);
            if (!Number.isSafeInteger(dependency.minRevision) || dependency.minRevision < 1)
                throw Error(`Publication: invalid minimum revision for ${dependency.id}`);
            if (Object.hasOwn(dependency, 'maxRevision') && (!Number.isSafeInteger(dependency.maxRevision)
                || dependency.maxRevision < dependency.minRevision))
                throw Error(`Publication: invalid maximum revision for ${dependency.id}`);
        }
    }
    return publication;
}
