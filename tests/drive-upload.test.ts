import { describe, expect, it } from 'vitest';
import {
  isRetryableUploadFailure,
  isTransientAppsScriptErrorMessage,
  parseDriveUploadResponse,
  type DriveUploadAttemptFailure,
} from '../src/services/api';
import {
  approxDecodedBytesFromBase64,
  chooseRemitoOutputMime,
  clampMaxEdge,
  TINY_PNG_KEEP_BYTES,
} from '../src/utils/imageCompress';

describe('parseDriveUploadResponse', () => {
  it('parses success with url', () => {
    const parsed = parseDriveUploadResponse(
      JSON.stringify({ status: 'success', url: 'https://drive.google.com/file/d/abc' })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.url).toContain('drive.google.com');
    }
  });

  it('classifies HTML as html failure', () => {
    const parsed = parseDriveUploadResponse('<!DOCTYPE html><html></html>');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.failure.kind).toBe('html');
    }
  });

  it('classifies invalid JSON', () => {
    const parsed = parseDriveUploadResponse('not-json{{{');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.failure.kind).toBe('invalid_json');
    }
  });

  it('surfaces server error message without treating as success', () => {
    const parsed = parseDriveUploadResponse(
      JSON.stringify({ status: 'error', message: 'No se pudo crear el archivo en Drive' })
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.failure.kind).toBe('server_error');
      expect(parsed.failure.serverMessage).toMatch(/crear el archivo/i);
    }
  });

  it('classifies success without url as empty_url', () => {
    const parsed = parseDriveUploadResponse(JSON.stringify({ status: 'success' }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.failure.kind).toBe('empty_url');
    }
  });
});

describe('upload retry classification', () => {
  it('retries http 404 and 5xx, not other 4xx', () => {
    expect(isRetryableUploadFailure({ kind: 'http', message: 'HTTP 404', httpStatus: 404 })).toBe(
      true
    );
    expect(isRetryableUploadFailure({ kind: 'http', message: 'HTTP 503', httpStatus: 503 })).toBe(
      true
    );
    expect(isRetryableUploadFailure({ kind: 'http', message: 'HTTP 403', httpStatus: 403 })).toBe(
      false
    );
  });

  it('retries html, invalid_json, empty_url, network', () => {
    const kinds: DriveUploadAttemptFailure['kind'][] = [
      'html',
      'invalid_json',
      'empty_url',
      'network',
    ];
    for (const kind of kinds) {
      expect(isRetryableUploadFailure({ kind, message: 'x' })).toBe(true);
    }
  });

  it('does not retry explicit server errors by default', () => {
    expect(
      isRetryableUploadFailure({
        kind: 'server_error',
        message: 'Carpeta no encontrada',
        serverMessage: 'Carpeta no encontrada',
      })
    ).toBe(false);
  });

  it('retries transient server messages', () => {
    expect(isTransientAppsScriptErrorMessage('Service temporarily unavailable')).toBe(true);
    expect(
      isRetryableUploadFailure({
        kind: 'server_error',
        message: 'timeout',
        serverMessage: 'Request timeout',
      })
    ).toBe(true);
  });
});

describe('imageCompress helpers', () => {
  it('clampMaxEdge leaves small images unchanged', () => {
    expect(clampMaxEdge(800, 600, 1600)).toEqual({ width: 800, height: 600, scaled: false });
  });

  it('clampMaxEdge scales longest edge to max', () => {
    const dims = clampMaxEdge(4000, 3000, 1600);
    expect(dims.scaled).toBe(true);
    expect(dims.width).toBe(1600);
    expect(dims.height).toBe(1200);
  });

  it('clampMaxEdge scales portrait correctly', () => {
    const dims = clampMaxEdge(1200, 4800, 1600);
    expect(dims.width).toBe(400);
    expect(dims.height).toBe(1600);
  });

  it('keeps tiny PNG mime and re-encodes larger PNG as JPEG', () => {
    expect(chooseRemitoOutputMime('image/png', TINY_PNG_KEEP_BYTES)).toBe('image/png');
    expect(chooseRemitoOutputMime('image/png', TINY_PNG_KEEP_BYTES + 1)).toBe('image/jpeg');
    expect(chooseRemitoOutputMime('image/jpeg', 500_000)).toBe('image/jpeg');
    expect(chooseRemitoOutputMime('image/webp', 10_000)).toBe('image/jpeg');
  });

  it('approxDecodedBytesFromBase64 is roughly 3/4 of length', () => {
    // "AAAA" -> 3 bytes
    expect(approxDecodedBytesFromBase64('AAAA')).toBe(3);
  });
});
