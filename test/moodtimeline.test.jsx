// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MoodTimeline, lastNDayKeys, moodRows, moodSummary } from "../src/ui/MoodTimeline.jsx";

// #97 — mood timeline: pure aggregation + a real render with tap-to-read.
describe("MoodTimeline (#97) — helpers", () => {
  it("lastNDayKeys yields n UNPADDED Y-M-D keys, oldest→newest, ending today", () => {
    const keys = lastNDayKeys(3, new Date(2026, 6, 30)); // July 30 2026
    expect(keys).toEqual(["2026-7-28", "2026-7-29", "2026-7-30"]);
  });
  it("lastNDayKeys crosses month boundaries on real calendar days", () => {
    const keys = lastNDayKeys(2, new Date(2026, 7, 1)); // Aug 1 2026
    expect(keys).toEqual(["2026-7-31", "2026-8-1"]);
  });

  const tiles = [{ id: "ci-am", type: "checkin", config: { title: "8:30" } }];
  const days = {
    "2026-7-29": { "ci-am": { feeling: "😊", feelingNote: "good morning" } },
    "2026-7-30": { "ci-am": { feeling: "😊" } },
  };

  it("moodRows maps days to cells with gaps, top emoji, and logged count", () => {
    const keys = lastNDayKeys(3, new Date(2026, 6, 30));
    const rows = moodRows(days, tiles, keys);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.map(c => c.feeling)).toEqual([null, "😊", "😊"]);
    expect(rows[0].cells[1].note).toBe("good morning");
    expect(rows[0].top).toBe("😊");
    expect(rows[0].logged).toBe(2);
  });

  it("moodSummary rolls up the most common emoji and days-with-any", () => {
    const keys = lastNDayKeys(3, new Date(2026, 6, 30));
    const { top, daysWithAny } = moodSummary(moodRows(days, tiles, keys));
    expect(top).toBe("😊");
    expect(daysWithAny).toBe(2);
  });
});

describe("MoodTimeline (#97) — render", () => {
  it("renders the strip and reveals the note on tap; hides with nothing logged", async () => {
    // Seed feelings on today so the default 30-day window catches them.
    const todayKeys = lastNDayKeys(1);
    const store = { days: { [todayKeys[0]]: { "ci-am": { feeling: "🔥", feelingNote: "on a roll" } } } };
    const tiles = [{ id: "ci-am", type: "checkin", config: { title: "8:30" } }];

    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      createRoot(container).render(React.createElement(MoodTimeline, { store, checkinTiles: tiles }));
    });
    expect(container.innerHTML).toContain("Mood — last 30 days");
    expect(container.innerHTML).toContain("🔥");

    const cell = [...container.querySelectorAll("button")].find(b => b.textContent === "🔥");
    await act(async () => { cell.click(); });
    expect(container.innerHTML).toContain("on a roll");

    // Empty store → component stays quiet entirely.
    const quiet = document.createElement("div");
    document.body.appendChild(quiet);
    await act(async () => {
      createRoot(quiet).render(React.createElement(MoodTimeline, { store: { days: {} }, checkinTiles: tiles }));
    });
    expect(quiet.innerHTML).toBe("");
  });
});
