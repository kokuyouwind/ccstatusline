import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { BlockMetrics } from '../../types';
import * as jsonl from '../jsonl';
import {
    FIVE_HOUR_BLOCK_MS,
    SEVEN_DAY_WINDOW_MS
} from '../usage-types';
import {
    formatResetAtAbsolute,
    formatResetAtCombined,
    formatUsageDuration,
    formatUsageDurationWithDays,
    getUsageWindowFromResetAt,
    getWeeklyUsageWindowFromResetAt,
    resolveUsageWindowWithFallback,
    resolveWeeklyUsageWindow
} from '../usage-windows';

describe('usage window helpers', () => {
    let mockGetCachedBlockMetrics: {
        mock: { calls: unknown[][] };
        mockReturnValue: (value: BlockMetrics | null) => void;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        mockGetCachedBlockMetrics = vi.spyOn(jsonl, 'getCachedBlockMetrics');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('parses usage reset timestamp into elapsed and remaining metrics', () => {
        const nowMs = Date.parse('2026-03-02T20:00:00.000Z');
        const resetAt = '2026-03-02T22:00:00.000Z';

        const window = getUsageWindowFromResetAt(resetAt, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3 * 60 * 60 * 1000);
        expect(window?.remainingMs).toBe(2 * 60 * 60 * 1000);
        expect(window?.elapsedPercent).toBeCloseTo(60, 5);
        expect(window?.remainingPercent).toBeCloseTo(40, 5);
        expect(window?.sessionDurationMs).toBe(FIVE_HOUR_BLOCK_MS);
    });

    it('uses usage data first and does not parse JSONL when reset timestamp exists', () => {
        const nowMs = Date.parse('2026-03-02T20:00:00.000Z');
        const fallbackMetrics: BlockMetrics = {
            startTime: new Date('2026-03-02T15:00:00.000Z'),
            lastActivity: new Date('2026-03-02T20:00:00.000Z')
        };

        mockGetCachedBlockMetrics.mockReturnValue(fallbackMetrics);

        const window = resolveUsageWindowWithFallback({ sessionResetAt: '2026-03-02T22:00:00.000Z' }, undefined, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(0);
    });

    it('uses provided block metrics fallback without parsing JSONL', () => {
        const nowMs = Date.parse('2026-03-02T18:30:00.000Z');
        const providedMetrics: BlockMetrics = {
            startTime: new Date('2026-03-02T15:00:00.000Z'),
            lastActivity: new Date('2026-03-02T18:30:00.000Z')
        };

        const window = resolveUsageWindowWithFallback({}, providedMetrics, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3.5 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(0);
    });

    it('parses JSONL fallback only when usage reset data is missing', () => {
        const nowMs = Date.parse('2026-03-02T18:00:00.000Z');
        const fallbackMetrics: BlockMetrics = {
            startTime: new Date('2026-03-02T15:00:00.000Z'),
            lastActivity: new Date('2026-03-02T18:00:00.000Z')
        };

        mockGetCachedBlockMetrics.mockReturnValue(fallbackMetrics);

        const window = resolveUsageWindowWithFallback({}, undefined, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(3 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(1);
    });

    it('returns null when neither usage reset data nor JSONL fallback is available', () => {
        mockGetCachedBlockMetrics.mockReturnValue(null);

        const window = resolveUsageWindowWithFallback({}, undefined, Date.now());

        expect(window).toBeNull();
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(1);
    });

    it('parses weekly reset timestamp into elapsed and remaining metrics', () => {
        const nowMs = Date.parse('2026-03-04T20:00:00.000Z');
        const resetAt = '2026-03-09T20:00:00.000Z';

        const window = getWeeklyUsageWindowFromResetAt(resetAt, nowMs);

        expect(window).not.toBeNull();
        expect(window?.elapsedMs).toBe(2 * 24 * 60 * 60 * 1000);
        expect(window?.remainingMs).toBe(5 * 24 * 60 * 60 * 1000);
        expect(window?.elapsedPercent).toBeCloseTo((2 / 7) * 100, 5);
        expect(window?.remainingPercent).toBeCloseTo((5 / 7) * 100, 5);
        expect(window?.sessionDurationMs).toBe(SEVEN_DAY_WINDOW_MS);
    });

    it('returns null for missing or invalid weekly reset timestamps', () => {
        expect(getWeeklyUsageWindowFromResetAt(undefined, Date.now())).toBeNull();
        expect(getWeeklyUsageWindowFromResetAt('not-a-date', Date.now())).toBeNull();
    });

    it('resolves weekly window directly from usage data without JSONL fallback', () => {
        const nowMs = Date.parse('2026-03-04T20:00:00.000Z');
        const window = resolveWeeklyUsageWindow({ weeklyResetAt: '2026-03-09T20:00:00.000Z' }, nowMs);

        expect(window).not.toBeNull();
        expect(window?.remainingMs).toBe(5 * 24 * 60 * 60 * 1000);
        expect(mockGetCachedBlockMetrics.mock.calls.length).toBe(0);
    });

    it('formats duration in block timer style', () => {
        expect(formatUsageDuration(0)).toBe('0hr');
        expect(formatUsageDuration(3 * 60 * 60 * 1000)).toBe('3hr');
        expect(formatUsageDuration(3.5 * 60 * 60 * 1000)).toBe('3hr 30m');
        expect(formatUsageDuration(4 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe('4hr 5m');
    });

    it('formats duration in compact style', () => {
        expect(formatUsageDuration(0, true)).toBe('0h');
        expect(formatUsageDuration(3 * 60 * 60 * 1000, true)).toBe('3h');
        expect(formatUsageDuration(3.5 * 60 * 60 * 1000, true)).toBe('3h30m');
        expect(formatUsageDuration(4 * 60 * 60 * 1000 + 5 * 60 * 1000, true)).toBe('4h5m');
    });

    it('formats duration with days in standard style', () => {
        expect(formatUsageDurationWithDays(0)).toBe('0hr');
        expect(formatUsageDurationWithDays(3 * 60 * 60 * 1000)).toBe('3hr');
        expect(formatUsageDurationWithDays(25 * 60 * 60 * 1000)).toBe('1d 1hr');
        expect(formatUsageDurationWithDays(5 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000 + 57 * 60 * 1000)).toBe('5d 12hr 57m');
        expect(formatUsageDurationWithDays(2 * 24 * 60 * 60 * 1000)).toBe('2d 0hr');
    });

    it('formats duration with days in compact style', () => {
        expect(formatUsageDurationWithDays(0, true)).toBe('0h');
        expect(formatUsageDurationWithDays(3 * 60 * 60 * 1000, true)).toBe('3h');
        expect(formatUsageDurationWithDays(25 * 60 * 60 * 1000, true)).toBe('1d 1h');
        expect(formatUsageDurationWithDays(5 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000 + 57 * 60 * 1000, true)).toBe('5d 12h57m');
        expect(formatUsageDurationWithDays(2 * 24 * 60 * 60 * 1000, true)).toBe('2d 0h');
    });

    it('formats reset at as absolute time on same day', () => {
        const nowMs = Date.parse('2026-03-07T10:00:00.000');
        const remainingMs = 4.5 * 60 * 60 * 1000; // 4hr 30m later = 14:30

        expect(formatResetAtAbsolute(remainingMs, nowMs)).toBe('14:30');
    });

    it('formats reset at as absolute time with weekday on different day', () => {
        const nowMs = Date.parse('2026-03-07T22:00:00.000');
        const remainingMs = 5 * 24 * 60 * 60 * 1000 + 16.5 * 60 * 60 * 1000; // Fri 14:30

        expect(formatResetAtAbsolute(remainingMs, nowMs)).toBe('Fri 14:30');
    });

    it('formats reset at as combined absolute and relative-days', () => {
        const nowMs = Date.parse('2026-03-07T22:00:00.000');
        const remainingMs = 5 * 24 * 60 * 60 * 1000 + 16.5 * 60 * 60 * 1000;

        expect(formatResetAtCombined(remainingMs, false, nowMs)).toBe('Fri 14:30 (5d 16hr 30m)');
        expect(formatResetAtCombined(remainingMs, true, nowMs)).toBe('Fri 14:30 (5d 16h30m)');
    });
});