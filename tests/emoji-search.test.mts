import { test } from "node:test";
import assert from "node:assert/strict";
import { rankEmojiCodes, type EmojiCodeItem } from "../lib/emoji-search";

const item = (code: string, kind = "standard"): EmojiCodeItem => ({
  code,
  kind: kind as "standard" | "custom",
  native: "x",
});

test("suggestions rank exact first, then prefixes, then substring matches", () => {
  const items = [
    item("smile"),
    item("smiley"),
    item("thumbsup"),
    item("thu", "custom"),
    item("athus"),
    item("thunder"),
  ];
  assert.deepEqual(
    rankEmojiCodes(items, "thu").map((i) => i.code),
    ["thu", "thunder", "thumbsup", "athus"],
  );
});

test("custom emojis outrank standard ones at the same tier; shorter codes win", () => {
  const codes = rankEmojiCodes(
    [item("thu"), item("thucc"), item("thu", "custom")],
    "thu",
  ).map((i) => i.code);
  assert.deepEqual(codes, ["thu", "thu", "thucc"]);
});

test("case-insensitive matching and empty/non-matching queries yield nothing", () => {
  assert.deepEqual(rankEmojiCodes([item("smile")], "SMI").map((i) => i.code), [
    "smile",
  ]);
  assert.deepEqual(rankEmojiCodes([item("smile")], "xyz"), []);
  assert.deepEqual(rankEmojiCodes([item("smile")], ""), []);
});
