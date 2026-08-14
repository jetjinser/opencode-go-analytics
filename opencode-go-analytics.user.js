// ==UserScript==
// @name         OpenCode Go Usage Analytics
// @namespace    https://github.com/jetjinser/opencode-go-analytics
// @version      2.1.0
// @description  Calculates and renders Burn Rate, Budget/Pacing, and Runway metrics inline for OpenCode Go usage limits.
// @author       Jinser Kafka <aimer@purejs.icu>
// @match        https://opencode.ai/*
// @license      MIT
// @supportURL   https://github.com/jetjinser/opencode-go-analytics/issues
// @updateURL    https://raw.githubusercontent.com/jetjinser/opencode-go-analytics/master/opencode-go-analytics.user.js
// @downloadURL  https://raw.githubusercontent.com/jetjinser/opencode-go-analytics/master/opencode-go-analytics.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Cycle length definitions in fractional days
    const CYCLE_CONFIGS = {
        'Rolling Usage': { totalDays: 4 / 24, budgetUnit: 'hr' }, // 4 hours cycle
        'Weekly Usage': { totalDays: 7, budgetUnit: 'd' }, // 7 days cycle
        'Monthly Usage': { totalDays: 31, budgetUnit: 'd' } // 31 days cycle
    };

    /**
     * Parses remaining time strings into fractional days.
     */
    function parseRemainingDays(text) {
        const daysMatch = text.match(/(\d+)\s*(?:days|day|d)/i);
        const hoursMatch = text.match(/(\d+)\s*(?:hours|hour|h)/i);
        const minsMatch = text.match(/(\d+)\s*(?:minutes|minute|mins|min|m)/i);

        const days = daysMatch ? parseFloat(daysMatch[1]) : 0;
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
        const mins = minsMatch ? parseFloat(minsMatch[1]) : 0;

        return days + (hours / 24) + (mins / 1440);
    }

    /**
     * Calculates Burn Rate Ratio, Budget/Pacing Allowance, and Runway Duration.
     */
    function calculateMetrics(usagePct, remainingDays, config) {
        const remainingPct = 100 - usagePct;
        const daysPassed = Math.max(0.001, config.totalDays - remainingDays);
        const timePassedPct = (daysPassed / config.totalDays) * 100;

        // 1. Burn Rate Ratio (>1.0 means spending faster than time elapsed)
        const burnRateRatio = usagePct / Math.max(0.1, timePassedPct);

        // 2. Budget / Pacing Calculation
        let budgetVal = 0;
        let budgetLabel = 'Daily Budget';

        if (config.budgetUnit === 'hr') {
            budgetLabel = 'Hourly Budget';
            const remainingHours = remainingDays * 24;
            budgetVal = remainingHours > 0 ? (remainingPct / remainingHours) : 0;
        } else {
            budgetVal = remainingDays > 0 ? (remainingPct / remainingDays) : 0;
        }

        // 3. Runway: How long current remaining % lasts at current consumption rate
        const currentRatePerDay = usagePct / daysPassed;
        const runwayDays = currentRatePerDay > 0 ? (remainingPct / currentRatePerDay) : 999;

        return {
            burnRateRatio: burnRateRatio.toFixed(2),
            budgetLabel: budgetLabel,
            budgetVal: budgetVal.toFixed(1),
            budgetUnit: config.budgetUnit,
            runwayDays: runwayDays
        };
    }

    /**
     * Formats runway duration into a clean string.
     */
    function formatRunway(runwayDays) {
        if (runwayDays >= 99) return '∞';
        if (runwayDays >= 1) {
            return `${runwayDays.toFixed(1)}d`;
        }
        const hours = runwayDays * 24;
        if (hours >= 1) {
            return `${hours.toFixed(1)}h`;
        }
        const mins = hours * 60;
        return `${Math.round(mins)}m`;
    }

    function injectInlineInsights() {
        const usageItems = document.querySelectorAll('div[data-slot="usage-item"]');

        usageItems.forEach(item => {
            const labelEl = item.querySelector('[data-slot="usage-label"]');
            if (!labelEl) return;

            const labelText = labelEl.textContent.trim();
            const config = CYCLE_CONFIGS[labelText];

            if (config) {
                const valueEl = item.querySelector('[data-slot="usage-value"]');
                const resetTimeEl = item.querySelector('[data-slot="reset-time"]');

                if (!valueEl || !resetTimeEl) return;

                const usagePct = parseFloat(valueEl.textContent.replace('%', ''));
                const remainingDays = parseRemainingDays(resetTimeEl.textContent);

                if (isNaN(usagePct) || isNaN(remainingDays)) return;

                const metrics = calculateMetrics(usagePct, remainingDays, config);

                // Determine burn rate color
                let ratioColor = '#a1a1aa'; // Neutral Gray
                if (metrics.burnRateRatio > 1.05) {
                    ratioColor = '#f87171'; // High Burn (Red)
                } else if (metrics.burnRateRatio < 0.85) {
                    ratioColor = '#4ade80'; // Low Burn (Green)
                }

                const formattedRunway = formatRunway(metrics.runwayDays);
                const dataSignature = `${metrics.burnRateRatio}-${metrics.budgetVal}-${formattedRunway}`;

                let insightsEl = item.querySelector('.custom-usage-insights');

                // Return early if signature matches to prevent DOM reflows
                if (insightsEl && insightsEl.dataset.sig === dataSignature) {
                    return;
                }

                if (!insightsEl) {
                    insightsEl = document.createElement('div');
                    insightsEl.className = 'custom-usage-insights';
                    insightsEl.style.cssText = `
                        margin-top: 10px;
                        padding-top: 8px;
                        border-top: 1px dashed rgba(255, 255, 255, 0.15);
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 8px;
                        text-align: left;
                    `;
                    item.appendChild(insightsEl);
                }

                insightsEl.dataset.sig = dataSignature;
                insightsEl.innerHTML = `
                    <div>
                        <div style="font-size: 11px; color: #71717a; margin-bottom: 2px;">Burn Rate</div>
                        <div style="font-size: 13px; font-weight: 600; color: ${ratioColor};">${metrics.burnRateRatio}x</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #71717a; margin-bottom: 2px;">${metrics.budgetLabel}</div>
                        <div style="font-size: 13px; font-weight: 600; color: #38bdf8;">${metrics.budgetVal}%/${metrics.budgetUnit}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #71717a; margin-bottom: 2px;">Runway</div>
                        <div style="font-size: 13px; font-weight: 600; color: #fbbf24;">${formattedRunway}</div>
                    </div>
                `;
            }
        });
    }

    // Debounce to prevent performance degradation
    let timer = null;
    function debouncedInject() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            injectInlineInsights();
        }, 100);
    }

    const targetNode = document.querySelector('[data-component="workspace-content"]') || document.body;
    const observer = new MutationObserver(() => {
        debouncedInject();
    });

    observer.observe(targetNode, { childList: true, subtree: true });

    // Initial Execution
    injectInlineInsights();
})();
