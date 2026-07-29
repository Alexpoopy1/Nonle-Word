"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const TARGET = "nona";
const STATS_KEY = "nonle-stats-v3";
const ENDLESS_STATS_KEY = "nonle-endless-stats-v2";
const LEGACY_STATS_KEY = "nona-player-stats-v1";
const DAILY_PROGRESS_KEY = "nonle-daily-progress-v3";
const ENDLESS_PROGRESS_KEY = "nonle-endless-progress-v2";
const LEGACY_PROGRESS_KEY = "nona-active-progress-v1";
const MODE_KEY = "nonle-mode-v3";
const SOUND_KEY = "nona-sound-v1";

type Mode = "daily" | "endless";

type GraphData = {
  dictionary: Set<string>;
  distance: Map<string, number>;
  nextTowardTarget: Map<string, string>;
};

type PlayerStats = {
  played: number;
  wins: number;
  bestSteps: number | null;
  totalSteps: number;
  currentStreak: number;
  maxStreak: number;
  lastDailyWin: string | null;
  dailyWins: Record<string, number>;
};

type SavedProgress = {
  date?: string;
  startWord: string;
  guesses: string[];
  hintsUsed: number;
  won: boolean;
  roundStarted: boolean;
};

const DEFAULT_STATS: PlayerStats = {
  played: 0,
  wins: 0,
  bestSteps: null,
  totalSteps: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastDailyWin: null,
  dailyWins: {},
};

const START_WORDS = [
  "fire",
  "glow",
  "heat",
  "burn",
  "coal",
  "soot",
  "warm",
  "cool",
  "game",
  "play",
  "word",
  "name",
  "star",
  "moon",
  "rain",
  "snow",
  "wind",
  "tree",
  "rock",
  "lake",
  "wave",
  "bird",
  "fish",
  "lion",
  "bear",
  "wolf",
  "frog",
  "duck",
  "goat",
  "lamb",
  "dark",
  "lamp",
  "mint",
  "rose",
  "blue",
  "gold",
  "pink",
  "lime",
  "ruby",
  "jazz",
  "vibe",
  "epic",
  "hero",
  "king",
  "book",
  "page",
  "code",
  "tech",
  "ship",
  "road",
  "path",
  "maze",
  "race",
  "fast",
  "slow",
  "jump",
  "calm",
  "loud",
  "song",
  "note",
  "tune",
  "drum",
  "food",
  "cake",
  "milk",
  "rice",
  "taco",
  "pear",
  "plum",
  "corn",
  "bean",
  "home",
  "room",
  "door",
  "wall",
  "roof",
  "town",
  "city",
  "park",
  "shop",
  "work",
  "desk",
  "time",
  "year",
  "week",
  "hour",
  "love",
  "kind",
  "bold",
  "wild",
  "good",
  "best",
  "easy",
  "hard",
  "luck",
  "hope",
  "wish",
  "grin",
  "joke",
  "pups",
  "cats",
  "dogs",
  "ants",
  "bugs",
  "worm",
  "gift",
  "card",
  "cash",
  "coin",
  "bank",
  "goal",
  "team",
  "solo",
  "life",
  "live",
  "move",
  "turn",
  "spot",
  "drop",
  "flip",
  "flow",
  "grow",
  "show",
  "know",
  "open",
  "shut",
  "lock",
];

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function patternFor(word: string, index: number) {
  return `${word.slice(0, index)}*${word.slice(index + 1)}`;
}

function buildGraph(words: string[]): GraphData {
  const dictionary = new Set(
    words
      .map((word) => word.toLowerCase())
      .filter((word) => /^[a-z]{4}$/.test(word)),
  );
  dictionary.add(TARGET);

  const buckets = new Map<string, string[]>();
  for (const word of dictionary) {
    for (let index = 0; index < 4; index += 1) {
      const pattern = patternFor(word, index);
      const bucket = buckets.get(pattern);
      if (bucket) bucket.push(word);
      else buckets.set(pattern, [word]);
    }
  }

  const distance = new Map<string, number>([[TARGET, 0]]);
  const nextTowardTarget = new Map<string, string>();
  const queue = [TARGET];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const word = queue[cursor];
    const wordDistance = distance.get(word) ?? 0;
    for (let index = 0; index < 4; index += 1) {
      const neighbors = buckets.get(patternFor(word, index)) ?? [];
      for (const neighbor of neighbors) {
        if (distance.has(neighbor)) continue;
        distance.set(neighbor, wordDistance + 1);
        nextTowardTarget.set(neighbor, word);
        queue.push(neighbor);
      }
    }
  }

  return { dictionary, distance, nextTowardTarget };
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dailyNumber() {
  const firstDay = Date.UTC(2026, 0, 1);
  const today = Date.parse(`${todayKey()}T00:00:00Z`);
  return Math.floor((today - firstDay) / 86_400_000) + 1;
}

function dayDifference(older: string, newer: string) {
  const olderTime = Date.parse(`${older}T00:00:00Z`);
  const newerTime = Date.parse(`${newer}T00:00:00Z`);
  return Math.round((newerTime - olderTime) / 86_400_000);
}

function differsByOne(left: string, right: string) {
  let differences = 0;
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) differences += 1;
  }
  return differences === 1;
}

function changedIndex(current: string, previous?: string) {
  if (!previous) return -1;
  return [...current].findIndex(
    (letter, index) => letter !== previous[index],
  );
}

function pickStart(graph: GraphData, seed: string, previous?: string) {
  const pool = START_WORDS.filter((word) => {
    const distance = graph.distance.get(word);
    return (
      graph.dictionary.has(word) &&
      word !== previous &&
      distance !== undefined &&
      distance >= 4 &&
      distance <= 8
    );
  });

  if (!pool.length) return "fire";
  return pool[hashText(seed) % pool.length];
}

function makeSeed(round: number) {
  if (typeof window !== "undefined" && window.crypto) {
    const values = new Uint32Array(2);
    window.crypto.getRandomValues(values);
    return `${values[0]}-${values[1]}-${round}`;
  }
  return `${Date.now()}-${round}`;
}

function parseStats(value: string | null): PlayerStats | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlayerStats>;
    return {
      played:
        typeof parsed.played === "number" && parsed.played >= 0
          ? parsed.played
          : 0,
      wins:
        typeof parsed.wins === "number" && parsed.wins >= 0 ? parsed.wins : 0,
      bestSteps:
        typeof parsed.bestSteps === "number" && parsed.bestSteps > 0
          ? parsed.bestSteps
          : null,
      totalSteps:
        typeof parsed.totalSteps === "number" && parsed.totalSteps >= 0
          ? parsed.totalSteps
          : 0,
      currentStreak:
        typeof parsed.currentStreak === "number" && parsed.currentStreak >= 0
          ? parsed.currentStreak
          : 0,
      maxStreak:
        typeof parsed.maxStreak === "number" && parsed.maxStreak >= 0
          ? parsed.maxStreak
          : 0,
      lastDailyWin:
        typeof parsed.lastDailyWin === "string" ? parsed.lastDailyWin : null,
      dailyWins:
        parsed.dailyWins && typeof parsed.dailyWins === "object"
          ? parsed.dailyWins
          : {},
    };
  } catch {
    return null;
  }
}

function parseProgress(value: string | null, graph: GraphData) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SavedProgress>;
    const savedGuesses = Array.isArray(parsed.guesses)
      ? parsed.guesses.filter(
          (word): word is string =>
            typeof word === "string" && graph.dictionary.has(word),
        )
      : [];
    const validChain =
      savedGuesses.length > 0 &&
      savedGuesses.every(
        (word, index) =>
          index === 0 || differsByOne(savedGuesses[index - 1], word),
      );

    if (
      typeof parsed.startWord !== "string" ||
      parsed.startWord !== savedGuesses[0] ||
      !validChain
    ) {
      return null;
    }

    return {
      date: typeof parsed.date === "string" ? parsed.date : undefined,
      startWord: parsed.startWord,
      guesses: savedGuesses,
      hintsUsed:
        typeof parsed.hintsUsed === "number" && parsed.hintsUsed >= 0
          ? parsed.hintsUsed
          : 0,
      won: parsed.won === true && savedGuesses.at(-1) === TARGET,
      roundStarted: parsed.roundStarted === true,
    } satisfies SavedProgress;
  } catch {
    return null;
  }
}

function BackspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 6H9l-6 6 6 6h12V6Zm-8 4 4 4m0-4-4 4" />
    </svg>
  );
}

export default function NonaGame({ dictionary }: { dictionary: string[] }) {
  const graph = useMemo(() => buildGraph(dictionary), [dictionary]);
  const dailyDate = todayKey();
  const dailyStart = useMemo(
    () => pickStart(graph, `nonle-daily-${dailyDate}`),
    [dailyDate, graph],
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const roundRef = useRef(0);
  const restoredRef = useRef(false);

  const [mode, setMode] = useState<Mode>("daily");
  const [startWord, setStartWord] = useState(dailyStart);
  const [guesses, setGuesses] = useState<string[]>([dailyStart]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("Change one letter at a time.");
  const [noticeType, setNoticeType] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [won, setWon] = useState(false);
  const [roundStarted, setRoundStarted] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [stats, setStats] = useState<PlayerStats>(DEFAULT_STATS);
  const [soundOn, setSoundOn] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentWord = guesses.at(-1) ?? startWord;
  const moves = guesses.length - 1;
  const par = graph.distance.get(startWord) ?? 0;
  const winRate = stats.played
    ? Math.round((stats.wins / stats.played) * 100)
    : 0;
  const averageSteps = stats.wins
    ? (stats.totalSteps / stats.wins).toFixed(1)
    : "—";
  const modalOpen = showHelp || showStats || showWin;

  useEffect(() => {
    if (restoredRef.current) return;
    const restoreTimer = window.setTimeout(() => {
      if (restoredRef.current) return;
      restoredRef.current = true;

      try {
        const savedStats = parseStats(window.localStorage.getItem(STATS_KEY));
        const endlessStats = parseStats(
          window.localStorage.getItem(ENDLESS_STATS_KEY),
        );
        const legacyStats = parseStats(
          window.localStorage.getItem(LEGACY_STATS_KEY),
        );

        const migratedStats = endlessStats
          ? {
              ...endlessStats,
              currentStreak: legacyStats?.currentStreak ?? 0,
              maxStreak: legacyStats?.maxStreak ?? 0,
              lastDailyWin: legacyStats?.lastDailyWin ?? null,
              dailyWins: legacyStats?.dailyWins ?? {},
            }
          : legacyStats;
        const nextStats = savedStats ?? migratedStats;
        if (nextStats) setStats(nextStats);

        setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "off");

        const nextMode: Mode =
          window.localStorage.getItem(MODE_KEY) === "endless"
            ? "endless"
            : "daily";
        const primaryProgress = parseProgress(
          window.localStorage.getItem(
            nextMode === "daily"
              ? DAILY_PROGRESS_KEY
              : ENDLESS_PROGRESS_KEY,
          ),
          graph,
        );
        const legacyDailyProgress =
          nextMode === "daily"
            ? parseProgress(
                window.localStorage.getItem(LEGACY_PROGRESS_KEY),
                graph,
              )
            : null;
        const savedProgress = primaryProgress ?? legacyDailyProgress;
        const canRestore =
          savedProgress !== null &&
          (nextMode === "endless" ||
            (savedProgress.date === dailyDate &&
              savedProgress.startWord === dailyStart));

        setMode(nextMode);

        if (canRestore && savedProgress) {
          setStartWord(savedProgress.startWord);
          setGuesses(savedProgress.guesses);
          setHintsUsed(savedProgress.hintsUsed);
          setWon(savedProgress.won);
          setRoundStarted(savedProgress.roundStarted);
          setNotice(
            nextMode === "daily"
              ? savedProgress.won
                ? "Today’s puzzle is solved."
                : "Today’s puzzle is ready."
              : savedProgress.won
                ? "Solved. Start the next word when you are ready."
                : "Your endless game is ready.",
          );
        } else if (nextMode === "daily") {
          setStartWord(dailyStart);
          setGuesses([dailyStart]);
          setNotice("Today’s puzzle. Change one letter at a time.");
        } else {
          roundRef.current += 1;
          const freshStart = pickStart(
            graph,
            makeSeed(roundRef.current),
            dailyStart,
          );
          setStartWord(freshStart);
          setGuesses([freshStart]);
          setNotice("Change one letter at a time.");
        }
      } catch {
        window.localStorage.removeItem(DAILY_PROGRESS_KEY);
        window.localStorage.removeItem(ENDLESS_PROGRESS_KEY);
      }

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [dailyDate, dailyStart, graph]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [hydrated, stats]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
  }, [hydrated, soundOn]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [hydrated, mode]);

  useEffect(() => {
    if (!hydrated) return;
    const progress: SavedProgress = {
      date: mode === "daily" ? dailyDate : undefined,
      startWord,
      guesses,
      hintsUsed,
      won,
      roundStarted,
    };
    window.localStorage.setItem(
      mode === "daily" ? DAILY_PROGRESS_KEY : ENDLESS_PROGRESS_KEY,
      JSON.stringify(progress),
    );
  }, [
    dailyDate,
    guesses,
    hintsUsed,
    hydrated,
    mode,
    roundStarted,
    startWord,
    won,
  ]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    board.scrollTo({
      top: board.scrollHeight,
      behavior: guesses.length > 2 ? "smooth" : "auto",
    });
  }, [guesses, input]);

  useEffect(() => {
    function closeModal(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShowHelp(false);
      setShowStats(false);
      setShowWin(false);
    }
    window.addEventListener("keydown", closeModal);
    return () => window.removeEventListener("keydown", closeModal);
  }, []);

  function playTone(type: "move" | "error" | "win" | "tap") {
    if (!soundOn) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = {
      tap: 300,
      move: 470,
      error: 150,
      win: 620,
    };

    oscillator.type = type === "error" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(
      frequencies[type],
      context.currentTime,
    );
    if (type === "win") {
      oscillator.frequency.exponentialRampToValueAtTime(
        900,
        context.currentTime + 0.2,
      );
    }
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + (type === "win" ? 0.34 : 0.12),
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === "win" ? 0.36 : 0.14));
    oscillator.addEventListener("ended", () => void context.close());
  }

  function applyProgress(progress: SavedProgress, nextMode: Mode) {
    setStartWord(progress.startWord);
    setGuesses(progress.guesses);
    setInput("");
    setHintsUsed(progress.hintsUsed);
    setWon(progress.won);
    setRoundStarted(progress.roundStarted);
    setShowWin(false);
    setCopied(false);
    setNotice(
      nextMode === "daily"
        ? progress.won
          ? "Today’s puzzle is solved."
          : "Today’s puzzle is ready."
        : progress.won
          ? "Solved. Start the next word when you are ready."
          : "Your endless game is ready.",
    );
    setNoticeType(progress.won ? "success" : "neutral");
  }

  function saveCurrentProgress() {
    if (!hydrated) return;
    const progress: SavedProgress = {
      date: mode === "daily" ? dailyDate : undefined,
      startWord,
      guesses,
      hintsUsed,
      won,
      roundStarted,
    };
    window.localStorage.setItem(
      mode === "daily" ? DAILY_PROGRESS_KEY : ENDLESS_PROGRESS_KEY,
      JSON.stringify(progress),
    );
  }

  function freshEndlessRound() {
    roundRef.current += 1;
    const nextStart = pickStart(
      graph,
      makeSeed(roundRef.current),
      mode === "endless" ? startWord : dailyStart,
    );
    setMode("endless");
    setStartWord(nextStart);
    setGuesses([nextStart]);
    setInput("");
    setWon(false);
    setRoundStarted(false);
    setHintsUsed(0);
    setShowWin(false);
    setCopied(false);
    setNotice("Change one letter at a time.");
    setNoticeType("neutral");
  }

  function selectMode(nextMode: Mode) {
    if (nextMode === mode) return;
    saveCurrentProgress();

    const savedProgress = parseProgress(
      window.localStorage.getItem(
        nextMode === "daily" ? DAILY_PROGRESS_KEY : ENDLESS_PROGRESS_KEY,
      ),
      graph,
    );
    const canRestore =
      savedProgress !== null &&
      (nextMode === "endless" ||
        (savedProgress.date === dailyDate &&
          savedProgress.startWord === dailyStart));

    setMode(nextMode);
    if (canRestore && savedProgress) {
      applyProgress(savedProgress, nextMode);
    } else if (nextMode === "daily") {
      applyProgress(
        {
          date: dailyDate,
          startWord: dailyStart,
          guesses: [dailyStart],
          hintsUsed: 0,
          won: false,
          roundStarted: false,
        },
        "daily",
      );
      setNotice("Today’s puzzle. Change one letter at a time.");
    } else {
      freshEndlessRound();
    }
    playTone("tap");
  }

  function newRound() {
    freshEndlessRound();
    playTone("tap");
  }

  function continueAfterWin() {
    if (mode === "daily") saveCurrentProgress();
    newRound();
  }

  function restartRound() {
    if (won) return;
    setGuesses([startWord]);
    setInput("");
    setHintsUsed(0);
    setNotice("This word has been restarted.");
    setNoticeType("neutral");
    playTone("tap");
  }

  function submitGuess() {
    if (won) return;
    const guess = input.toLowerCase();

    if (guess.length !== 4) {
      setNotice("Enter four letters.");
      setNoticeType("error");
      playTone("error");
      return;
    }
    if (!graph.dictionary.has(guess)) {
      setNotice("That is not in the word list.");
      setNoticeType("error");
      playTone("error");
      return;
    }
    if (!differsByOne(currentWord, guess)) {
      setNotice(`Change one letter from ${currentWord.toUpperCase()}.`);
      setNoticeType("error");
      playTone("error");
      return;
    }
    if (guesses.includes(guess)) {
      setNotice("You already used that word.");
      setNoticeType("error");
      playTone("error");
      return;
    }

    const isFirstMove = !roundStarted;
    const nextGuesses = [...guesses, guess];
    const nextMoves = nextGuesses.length - 1;
    setGuesses(nextGuesses);
    setInput("");
    if (isFirstMove) setRoundStarted(true);

    if (guess === TARGET) {
      const winDate = todayKey();
      setWon(true);
      setNotice(
        nextMoves <= par
          ? "Perfect. You found a shortest path."
          : "You reached NONA.",
      );
      setNoticeType("success");
      setStats((current) => {
        const firstDailyWin =
          mode === "daily" && current.dailyWins[winDate] === undefined;
        const dailyWins =
          mode === "daily"
            ? {
                ...current.dailyWins,
                [winDate]: Math.min(
                  current.dailyWins[winDate] ?? nextMoves,
                  nextMoves,
                ),
              }
            : current.dailyWins;
        const nextStreak = firstDailyWin
          ? current.lastDailyWin &&
            dayDifference(current.lastDailyWin, winDate) === 1
            ? current.currentStreak + 1
            : 1
          : current.currentStreak;

        return {
          ...current,
          played: current.played + (isFirstMove ? 1 : 0),
          wins: current.wins + 1,
          bestSteps:
            current.bestSteps === null
              ? nextMoves
              : Math.min(current.bestSteps, nextMoves),
          totalSteps: current.totalSteps + nextMoves,
          currentStreak: nextStreak,
          maxStreak: Math.max(current.maxStreak, nextStreak),
          lastDailyWin: firstDailyWin ? winDate : current.lastDailyWin,
          dailyWins,
        };
      });
      playTone("win");
      window.setTimeout(() => setShowWin(true), 220);
      return;
    }

    if (isFirstMove) {
      setStats((current) => ({
        ...current,
        played: current.played + 1,
      }));
    }

    const remaining = graph.distance.get(guess);
    setNotice(
      remaining === undefined
        ? "Valid move."
        : `${remaining} move${remaining === 1 ? "" : "s"} from NONA.`,
    );
    setNoticeType("success");
    playTone("move");
  }

  function undo() {
    if (guesses.length <= 1 || won) return;
    setGuesses((current) => current.slice(0, -1));
    setInput("");
    setNotice("Last word removed.");
    setNoticeType("neutral");
    playTone("tap");
  }

  function hint() {
    if (won) return;
    const next = graph.nextTowardTarget.get(currentWord);
    if (!next) {
      setNotice("No hint here. Undo and try another word.");
      setNoticeType("error");
      playTone("error");
      return;
    }

    setInput(next);
    setHintsUsed((current) => current + 1);
    setNotice("A shortest-path word is ready. Press Enter.");
    setNoticeType("neutral");
    playTone("tap");
  }

  function handleKey(key: string) {
    if (won || modalOpen) return;
    if (key === "backspace") {
      setInput((current) => current.slice(0, -1));
    } else if (key === "enter") {
      submitGuess();
    } else {
      setInput((current) => `${current}${key}`.slice(0, 4));
    }
  }

  useEffect(() => {
    function handlePhysicalKeyboard(event: KeyboardEvent) {
      if (modalOpen) return;
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        handleKey(event.key.toLowerCase());
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleKey("backspace");
      } else if (event.key === "Enter") {
        event.preventDefault();
        handleKey("enter");
      }
    }

    window.addEventListener("keydown", handlePhysicalKeyboard);
    return () => window.removeEventListener("keydown", handlePhysicalKeyboard);
  });

  async function shareResult() {
    const rows = guesses
      .slice(1)
      .map((word, index) => {
        const previous = guesses[index];
        const hotIndex = changedIndex(word, previous);
        return [...word]
          .map((_, letterIndex) => (letterIndex === hotIndex ? "🟫" : "⬛"))
          .join("");
      })
      .join("\n");
    const shareTitle =
      mode === "daily"
        ? `Nonle Daily #${dailyNumber()}`
        : "Nonle Endless";
    const result = `${shareTitle} • ${moves} move${
      moves === 1 ? "" : "s"
    }${hintsUsed ? ` • ${hintsUsed} hint${hintsUsed === 1 ? "" : "s"}` : ""}\n${rows}\n${startWord.toUpperCase()} → NONA`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Nonle Word", text: result });
      } else {
        await navigator.clipboard.writeText(result);
      }
      setCopied(true);
      playTone("tap");
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(result);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        setNotice("Sharing is unavailable in this browser.");
        setNoticeType("error");
      }
    }
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <h1>
          Nonle <span aria-hidden="true">🔥</span>
        </h1>
        <div className="mode-switch" role="group" aria-label="Game mode">
          <button
            type="button"
            className={mode === "daily" ? "active" : ""}
            aria-pressed={mode === "daily"}
            onClick={() => selectMode("daily")}
          >
            Daily
          </button>
          <button
            type="button"
            className={mode === "endless" ? "active" : ""}
            aria-pressed={mode === "endless"}
            onClick={() => selectMode("endless")}
          >
            Endless
          </button>
        </div>
        <p>
          <span>
            {mode === "daily" ? `DAILY #${dailyNumber()}` : "ENDLESS"}
          </span>
          {startWord.toUpperCase()} → NONA · {moves}{" "}
          {moves === 1 ? "move" : "moves"}
        </p>
      </header>

      <section
        className="play-area"
        aria-label={`Nonle ${mode} word game`}
      >
        <div className="word-board" ref={boardRef} aria-live="polite">
          {guesses.map((word, guessIndex) => {
            const previous = guesses[guessIndex - 1];
            const hotIndex = changedIndex(word, previous);
            return (
              <div className="word-row" key={`${word}-${guessIndex}`}>
                {[...word].map((letter, letterIndex) => (
                  <span
                    className={`word-tile ${
                      letterIndex === hotIndex ? "changed" : ""
                    }`}
                    key={`${letter}-${letterIndex}`}
                  >
                    {letter}
                  </span>
                ))}
              </div>
            );
          })}

          {!won && (
            <div className="word-row entry-row" aria-label="Current entry">
              {[0, 1, 2, 3].map((index) => (
                <span
                  className={`word-tile entry-tile ${
                    input[index] ? "filled" : ""
                  }`}
                  key={index}
                >
                  {input[index] ?? ""}
                </span>
              ))}
            </div>
          )}
        </div>

        <p className={`game-notice ${noticeType}`} role="status">
          {notice}
        </p>

        <div className="utility-row" aria-label="Game controls">
          <button
            type="button"
            onClick={() =>
              mode === "daily" ? selectMode("endless") : newRound()
            }
          >
            {mode === "daily" ? "Play endless" : "New word"}
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={guesses.length <= 1 || won}
          >
            Undo
          </button>
          <button type="button" onClick={restartRound} disabled={won}>
            Restart
          </button>
          <button type="button" onClick={hint} disabled={won}>
            Hint
          </button>
          <button
            type="button"
            onClick={() => setSoundOn((current) => !current)}
            aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
          >
            Sound {soundOn ? "on" : "off"}
          </button>
        </div>

        <div className="keyboard" aria-label="On-screen keyboard">
          {KEY_ROWS.map((row, rowIndex) => (
            <div className="keyboard-row" key={row}>
              {rowIndex === 2 && (
                <button
                  type="button"
                  className="key wide-key"
                  onClick={() => handleKey("enter")}
                  aria-label="Submit word"
                >
                  Enter
                </button>
              )}

              {[...row].map((letter) => (
                <button
                  type="button"
                  className="key"
                  key={letter}
                  onClick={() => handleKey(letter)}
                  aria-label={`Letter ${letter.toUpperCase()}`}
                >
                  {letter}
                </button>
              ))}

              {rowIndex === 2 && (
                <button
                  type="button"
                  className="key wide-key icon-key"
                  onClick={() => handleKey("backspace")}
                  aria-label="Delete letter"
                >
                  <BackspaceIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="bottom-links">
        <button type="button" onClick={() => setShowStats(true)}>
          Show stats
        </button>
        <button type="button" onClick={() => setShowHelp(true)}>
          How to play
        </button>
      </footer>

      {showHelp && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowHelp(false);
          }}
        >
          <section
            className="simple-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setShowHelp(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 id="help-title">How to play</h2>
            <p>
              Turn the starting word into <strong>NONA</strong>. Change exactly
              one letter each move, and every row must be a real four-letter
              word.
            </p>
            <div className="example-row" aria-label="Example word change">
              {[..."word"].map((letter, index) => (
                <span className={`mini-tile ${index === 0 ? "changed" : ""}`} key={index}>
                  {letter}
                </span>
              ))}
            </div>
            <p className="modal-note">
              The brown tile shows the letter that changed. Finish a word, then
              press Enter. Daily gives everyone the same puzzle; Endless keeps
              generating new ones.
            </p>
            <button
              type="button"
              className="modal-button"
              onClick={() => setShowHelp(false)}
            >
              Play
            </button>
          </section>
        </div>
      )}

      {showStats && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowStats(false);
          }}
        >
          <section
            className="simple-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stats-title"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setShowStats(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 id="stats-title">Your stats</h2>
            <div className="stats-grid">
              <div>
                <strong>{stats.played}</strong>
                <span>Played</span>
              </div>
              <div>
                <strong>{winRate}%</strong>
                <span>Win rate</span>
              </div>
              <div>
                <strong>{stats.bestSteps ?? "—"}</strong>
                <span>Best</span>
              </div>
              <div>
                <strong>{averageSteps}</strong>
                <span>Average</span>
              </div>
              <div>
                <strong>{stats.currentStreak}</strong>
                <span>Streak</span>
              </div>
              <div>
                <strong>{stats.maxStreak}</strong>
                <span>Max streak</span>
              </div>
            </div>
            <button
              type="button"
              className="modal-button"
              onClick={() => setShowStats(false)}
            >
              Done
            </button>
          </section>
        </div>
      )}

      {showWin && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="simple-modal win-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-title"
          >
            <span className="win-mark" aria-hidden="true">
              N
            </span>
            <h2 id="win-title">You reached NONA</h2>
            <p>
              {moves} move{moves === 1 ? "" : "s"}
              {par ? ` · shortest path ${par}` : ""}
              {hintsUsed
                ? ` · ${hintsUsed} hint${hintsUsed === 1 ? "" : "s"}`
                : ""}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button"
                onClick={shareResult}
              >
                {copied ? "Copied" : "Share"}
              </button>
              <button
                type="button"
                className="modal-button"
                onClick={continueAfterWin}
              >
                {mode === "daily" ? "Play endless" : "Next word"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
