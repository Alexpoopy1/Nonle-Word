"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const TARGET = "nona";

type Mode = "daily" | "endless";
type Difficulty = "easy" | "warm" | "inferno";

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
  date: string;
  mode: Mode;
  difficulty: Difficulty;
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

const STATS_KEY = "nona-player-stats-v1";
const PROGRESS_KEY = "nona-active-progress-v1";
const SOUND_KEY = "nona-sound-v1";

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
    words.map((word) => word.toLowerCase()).filter((word) => /^[a-z]{4}$/.test(word)),
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

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
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
  return [...current].findIndex((letter, index) => letter !== previous[index]);
}

function pickStart(
  graph: GraphData,
  mode: Mode,
  difficulty: Difficulty,
  seed: string,
  previous?: string,
) {
  const ranges: Record<Difficulty, [number, number]> = {
    easy: [3, 4],
    warm: [5, 6],
    inferno: [7, 10],
  };
  const [minimum, maximum] = ranges[difficulty];
  const pool = START_WORDS.filter((word) => {
    const steps = graph.distance.get(word);
    if (steps === undefined || word === previous) return false;
    if (mode === "daily") return steps >= 4 && steps <= 8;
    return steps >= minimum && steps <= maximum;
  });

  if (!pool.length) return "fire";
  return pool[hashText(seed) % pool.length];
}

function FlameLogo() {
  return (
    <span className="brand-flame" aria-hidden="true">
      <span className="brand-flame-inner" />
    </span>
  );
}

function Icon({
  name,
}: {
  name:
    | "arrow"
    | "undo"
    | "restart"
    | "hint"
    | "shuffle"
    | "backspace"
    | "help"
    | "stats"
    | "sound"
    | "mute"
    | "share"
    | "close";
}) {
  const paths = {
    arrow: "M5 12h14m-5-5 5 5-5 5",
    undo: "M9 8 4 12l5 4M5 12h8a6 6 0 1 1 0 12",
    restart: "M20 11a8 8 0 1 0 2 5M20 4v7h-7",
    hint: "M9 18h6M10 22h4M8 14a7 7 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3Z",
    shuffle: "M4 7h3c4 0 6 10 10 10h3M17 4l3 3-3 3M4 17h3c1.5 0 2.7-1.3 3.8-3M17 14l3 3-3 3",
    backspace: "M21 6H9l-6 6 6 6h12V6Zm-8 4 4 4m0-4-4 4",
    help: "M9.6 9a2.7 2.7 0 1 1 4.8 1.7c-.9 1.1-2.4 1.4-2.4 3.3M12 18h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    stats: "M5 20V10m7 10V4m7 16v-7",
    sound: "M11 5 6 9H3v6h3l5 4V5Zm4 4c1.3 1.7 1.3 4.3 0 6m3-9c3.1 3.3 3.1 8.7 0 12",
    mute: "M11 5 6 9H3v6h3l5 4V5Zm5 5 5 5m0-5-5 5",
    share: "M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8",
    close: "m6 6 12 12M18 6 6 18",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export default function NonaGame({ dictionary }: { dictionary: string[] }) {
  const graph = useMemo(() => buildGraph(dictionary), [dictionary]);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);
  const [mode, setMode] = useState<Mode>("daily");
  const [difficulty, setDifficulty] = useState<Difficulty>("warm");
  const [roundSeed, setRoundSeed] = useState(0);
  const dailyStart = useMemo(
    () => pickStart(graph, "daily", "warm", todayKey()),
    [graph],
  );
  const [startWord, setStartWord] = useState(dailyStart);
  const [guesses, setGuesses] = useState<string[]>([dailyStart]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState(
    "Change exactly one letter to make a real word.",
  );
  const [noticeType, setNoticeType] = useState<"neutral" | "error" | "success">(
    "neutral",
  );
  const [won, setWon] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [roundStarted, setRoundStarted] = useState(false);
  const [stats, setStats] = useState<PlayerStats>(DEFAULT_STATS);
  const [soundOn, setSoundOn] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentWord = guesses[guesses.length - 1];
  const par = graph.distance.get(startWord) ?? 0;
  const moves = guesses.length - 1;
  const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const averageSteps = stats.wins
    ? (stats.totalSteps / stats.wins).toFixed(1)
    : "—";

  useEffect(() => {
    if (restoredRef.current) return;
    const restoreTimer = window.setTimeout(() => {
      if (restoredRef.current) return;
      restoredRef.current = true;

      try {
        const savedStats = window.localStorage.getItem(STATS_KEY);
        if (savedStats) {
          const parsed = JSON.parse(savedStats) as Partial<PlayerStats>;
          setStats({
            ...DEFAULT_STATS,
            ...parsed,
            dailyWins:
              parsed.dailyWins && typeof parsed.dailyWins === "object"
                ? parsed.dailyWins
                : {},
          });
        }

        setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "off");

        const savedProgress = window.localStorage.getItem(PROGRESS_KEY);
        if (savedProgress) {
          const parsed = JSON.parse(savedProgress) as Partial<SavedProgress>;
          const savedGuesses = Array.isArray(parsed.guesses)
            ? parsed.guesses.filter(
                (word): word is string =>
                  typeof word === "string" && graph.dictionary.has(word),
              )
            : [];
          const chainIsValid =
            savedGuesses.length > 0 &&
            savedGuesses.every(
              (word, index) =>
                index === 0 || differsByOne(savedGuesses[index - 1], word),
            );
          const canRestore =
            parsed.date === todayKey() &&
            (parsed.mode === "daily" || parsed.mode === "endless") &&
            (parsed.difficulty === "easy" ||
              parsed.difficulty === "warm" ||
              parsed.difficulty === "inferno") &&
            typeof parsed.startWord === "string" &&
            parsed.startWord === savedGuesses[0] &&
            chainIsValid;

          if (canRestore) {
            setMode(parsed.mode as Mode);
            setDifficulty(parsed.difficulty as Difficulty);
            setStartWord(parsed.startWord as string);
            setGuesses(savedGuesses);
            setHintsUsed(
              typeof parsed.hintsUsed === "number" ? parsed.hintsUsed : 0,
            );
            setWon(parsed.won === true && savedGuesses.at(-1) === TARGET);
            setRoundStarted(parsed.roundStarted === true);
            setNotice(
              parsed.won
                ? "Solved — your route is saved on this device."
                : "Your saved ladder is ready to continue.",
            );
          }
        }
      } catch {
        window.localStorage.removeItem(PROGRESS_KEY);
      }

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [graph]);

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
    const progress: SavedProgress = {
      date: todayKey(),
      mode,
      difficulty,
      startWord,
      guesses,
      hintsUsed,
      won,
      roundStarted,
    };
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }, [
    difficulty,
    guesses,
    hintsUsed,
    hydrated,
    mode,
    roundStarted,
    startWord,
    won,
  ]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setShowHelp(false);
      setShowStats(false);
      setShowWin(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
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
      tap: 320,
      move: 520,
      error: 170,
      win: 680,
    };
    oscillator.type = type === "error" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(frequencies[type], context.currentTime);
    if (type === "win") {
      oscillator.frequency.exponentialRampToValueAtTime(
        980,
        context.currentTime + 0.22,
      );
    }
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + (type === "win" ? 0.38 : 0.14),
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === "win" ? 0.4 : 0.16));
    oscillator.addEventListener("ended", () => {
      void context.close();
    });
  }

  function resetRound(nextMode = mode, nextDifficulty = difficulty, forceNew = false) {
    const nextSeed = forceNew ? roundSeed + 1 : roundSeed;
    const nextStart =
      nextMode === "daily"
        ? pickStart(graph, "daily", "warm", todayKey())
        : pickStart(
            graph,
            "endless",
            nextDifficulty,
            `${todayKey()}-${nextDifficulty}-${nextSeed}`,
            startWord,
          );
    setRoundSeed(nextSeed);
    setStartWord(nextStart);
    setGuesses([nextStart]);
    setInput("");
    setWon(false);
    setHintsUsed(0);
    setRoundStarted(false);
    setShowWin(false);
    setCopied(false);
    setNotice("Change exactly one letter to make a real word.");
    setNoticeType("neutral");
    playTone("tap");
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }

  function selectMode(nextMode: Mode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    resetRound(nextMode, difficulty, nextMode === "endless");
  }

  function selectDifficulty(nextDifficulty: Difficulty) {
    setDifficulty(nextDifficulty);
    if (mode === "endless") resetRound(mode, nextDifficulty, true);
  }

  function submitGuess() {
    if (won) return;
    const guess = input.toLowerCase();
    if (guess.length !== 4) {
      setNotice("Enter all four letters first.");
      setNoticeType("error");
      playTone("error");
      return;
    }
    if (!graph.dictionary.has(guess)) {
      setNotice("That word isn’t in the NONA dictionary.");
      setNoticeType("error");
      playTone("error");
      return;
    }
    if (!differsByOne(currentWord, guess)) {
      setNotice(`Change exactly one letter from ${currentWord.toUpperCase()}.`);
      setNoticeType("error");
      playTone("error");
      return;
    }
    if (guesses.includes(guess)) {
      setNotice("You already used that word. Try another route.");
      setNoticeType("error");
      playTone("error");
      return;
    }

    const firstMove = !roundStarted;
    const nextGuesses = [...guesses, guess];
    const nextMoves = nextGuesses.length - 1;
    setGuesses(nextGuesses);
    setInput("");
    if (firstMove) setRoundStarted(true);

    if (guess === TARGET) {
      setWon(true);
      setNotice(
        nextMoves <= par
          ? "Perfect route — you matched the shortest path!"
          : "You made it to NONA!",
      );
      setNoticeType("success");
      setStats((current) => {
        const day = todayKey();
        const firstDailyWin =
          mode === "daily" && current.dailyWins[day] === undefined;
        let currentStreak = current.currentStreak;
        let lastDailyWin = current.lastDailyWin;
        const dailyWins = { ...current.dailyWins };

        if (mode === "daily") {
          dailyWins[day] =
            dailyWins[day] === undefined
              ? nextMoves
              : Math.min(dailyWins[day], nextMoves);
          if (firstDailyWin) {
            currentStreak =
              current.lastDailyWin &&
              dayDifference(current.lastDailyWin, day) === 1
                ? current.currentStreak + 1
                : 1;
            lastDailyWin = day;
          }
        }

        return {
          ...current,
          played: current.played + (firstMove ? 1 : 0),
          wins: current.wins + 1,
          bestSteps:
            current.bestSteps === null
              ? nextMoves
              : Math.min(current.bestSteps, nextMoves),
          totalSteps: current.totalSteps + nextMoves,
          currentStreak,
          maxStreak: Math.max(current.maxStreak, currentStreak),
          lastDailyWin,
          dailyWins,
        };
      });
      playTone("win");
      window.setTimeout(() => setShowWin(true), 260);
    } else {
      if (firstMove) {
        setStats((current) => ({ ...current, played: current.played + 1 }));
      }
      const remaining = graph.distance.get(guess);
      setNotice(
        remaining === undefined
          ? "Valid move. Keep the ladder going."
          : `${remaining} shortest-path move${remaining === 1 ? "" : "s"} from NONA.`,
      );
      setNoticeType("success");
      playTone("move");
    }
  }

  function undo() {
    if (guesses.length <= 1 || won) return;
    setGuesses((current) => current.slice(0, -1));
    setInput("");
    setNotice("Last move removed.");
    setNoticeType("neutral");
    playTone("tap");
    inputRef.current?.focus();
  }

  function hint() {
    if (won) return;
    const next = graph.nextTowardTarget.get(currentWord);
    if (!next) {
      setNotice("No hint is available from this word. Undo and try another route.");
      setNoticeType("error");
      return;
    }
    setInput(next);
    setHintsUsed((current) => current + 1);
    const index = changedIndex(next, currentWord);
    setNotice(
      `Hint: change letter ${index + 1}. A shortest-path word is ready to submit.`,
    );
    setNoticeType("neutral");
    playTone("tap");
    inputRef.current?.focus();
  }

  function handleVirtualKey(key: string) {
    if (won) return;
    if (key === "backspace") setInput((current) => current.slice(0, -1));
    else if (key === "enter") submitGuess();
    else setInput((current) => `${current}${key}`.slice(0, 4));
    inputRef.current?.focus();
  }

  function startNextFromWin() {
    if (mode === "daily") {
      setMode("endless");
      resetRound("endless", difficulty, true);
    } else {
      resetRound("endless", difficulty, true);
    }
  }

  async function shareResult() {
    const grid = guesses
      .slice(1)
      .map((word, index) => {
        const previous = guesses[index];
        const hotIndex = changedIndex(word, previous);
        return [...word]
          .map((_, letterIndex) => (letterIndex === hotIndex ? "🟧" : "⬜"))
          .join("");
      })
      .join("\n");
    const title =
      mode === "daily" ? `NONA Daily #${dailyNumber()}` : "NONA Endless";
    const result = `${title} • ${moves} move${moves === 1 ? "" : "s"}${
      hintsUsed ? ` • ${hintsUsed} hint${hintsUsed === 1 ? "" : "s"}` : ""
    }\n${grid}\n🔥 ${startWord.toUpperCase()} → NONA`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "NONA Word Game", text: result });
      } else {
        await navigator.clipboard.writeText(result);
      }
      setCopied(true);
      playTone("tap");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(result);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setNotice("Sharing isn’t available in this browser.");
        setNoticeType("error");
      }
    }
  }

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#" aria-label="NONA home">
          <FlameLogo />
          <span>NONA</span>
        </a>
        <div className="header-actions">
          <span className="daily-badge">
            <span className="live-dot" />
            Daily word ladder
          </span>
          <button
            className="header-icon"
            onClick={() => setSoundOn((current) => !current)}
            aria-label={soundOn ? "Mute sounds" : "Turn sounds on"}
            title={soundOn ? "Mute sounds" : "Turn sounds on"}
          >
            <Icon name={soundOn ? "sound" : "mute"} />
          </button>
          <button
            className="header-icon"
            onClick={() => setShowStats(true)}
            aria-label="Open stats"
            title="Stats"
          >
            <Icon name="stats" />
          </button>
          <button
            className="header-icon"
            onClick={() => setShowHelp(true)}
            aria-label="How to play"
            title="How to play"
          >
            <Icon name="help" />
          </button>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">
          <span>🔥</span> Four letters. One fiery finish.
        </p>
        <h1>
          Turn any word into <span>NONA.</span>
        </h1>
        <p className="hero-copy">
          Change one letter at a time. Every step must be a real word. Find the
          shortest path and keep your flame alive.
        </p>
      </section>

      <div className="game-layout">
        <section className="game-card" aria-label="NONA word game">
          <div className="mode-row">
            <div className="segmented" aria-label="Game mode">
              <button
                className={mode === "daily" ? "active" : ""}
                onClick={() => selectMode("daily")}
              >
                Daily
              </button>
              <button
                className={mode === "endless" ? "active" : ""}
                onClick={() => selectMode("endless")}
              >
                Endless
              </button>
            </div>
            <span className="puzzle-number">
              {mode === "daily" ? `Puzzle #${dailyNumber()}` : "Unlimited play"}
            </span>
          </div>

          {mode === "endless" && (
            <div className="difficulty-row" aria-label="Difficulty">
              {(["easy", "warm", "inferno"] as Difficulty[]).map((level) => (
                <button
                  key={level}
                  className={difficulty === level ? "selected" : ""}
                  onClick={() => selectDifficulty(level)}
                >
                  {level === "easy" ? "Easy" : level === "warm" ? "Warm" : "Inferno"}
                </button>
              ))}
            </div>
          )}

          <div className="route-head">
            <div>
              <span className="route-label">Starting word</span>
              <strong>{startWord.toUpperCase()}</strong>
            </div>
            <div className="route-line">
              <span />
              <Icon name="arrow" />
              <span />
            </div>
            <div className="route-goal">
              <span className="route-label">Your goal</span>
              <strong>NONA</strong>
            </div>
          </div>

          <div className="ladder" aria-live="polite">
            {guesses.map((word, guessIndex) => {
              const previous = guesses[guessIndex - 1];
              const hotIndex = changedIndex(word, previous);
              return (
                <div
                  className={`word-row ${guessIndex === 0 ? "start" : ""}`}
                  key={`${word}-${guessIndex}`}
                >
                  <span className="step-number">{guessIndex}</span>
                  <div className="letter-group">
                    {[...word].map((letter, letterIndex) => (
                      <span
                        className={`letter-tile ${
                          letterIndex === hotIndex ? "changed" : ""
                        }`}
                        key={`${letter}-${letterIndex}`}
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                  <span className="step-tag">
                    {guessIndex === 0 ? "START" : guessIndex === guesses.length - 1 ? "NOW" : ""}
                  </span>
                </div>
              );
            })}

            {!won && (
              <div
                className="entry-row"
                onClick={() => inputRef.current?.focus()}
              >
                <span className="step-number">{guesses.length}</span>
                <div className="input-tiles" aria-hidden="true">
                  {[0, 1, 2, 3].map((index) => (
                    <span className={input[index] ? "filled" : ""} key={index}>
                      {input[index] ?? ""}
                    </span>
                  ))}
                </div>
                <input
                  ref={inputRef}
                  className="hidden-word-input"
                  value={input}
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Enter a four letter word"
                  onChange={(event) =>
                    setInput(
                      event.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 4),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitGuess();
                  }}
                />
                <span className="step-tag typing">TYPE</span>
              </div>
            )}
          </div>

          <p className={`notice ${noticeType}`} role="status">
            <span>{noticeType === "error" ? "!" : noticeType === "success" ? "✓" : "i"}</span>
            {notice}
          </p>

          <div className="action-row">
            <button
              className="primary-action"
              onClick={won ? startNextFromWin : submitGuess}
            >
              {won ? (
                <>
                  <Icon name="shuffle" /> {mode === "daily" ? "Play endless" : "New word"}
                </>
              ) : (
                <>
                  Submit word <Icon name="arrow" />
                </>
              )}
            </button>
            <button
              className="icon-action"
              onClick={undo}
              disabled={guesses.length <= 1 || won}
              aria-label="Undo last word"
            >
              <Icon name="undo" />
            </button>
            <button
              className="icon-action"
              onClick={() => resetRound(mode, difficulty)}
              aria-label="Restart puzzle"
            >
              <Icon name="restart" />
            </button>
            <button className="hint-action" onClick={hint} disabled={won}>
              <Icon name="hint" /> Hint
            </button>
          </div>

          <div className="keyboard" aria-label="On-screen keyboard">
            {KEY_ROWS.map((row, rowIndex) => (
              <div className="keyboard-row" key={row}>
                {rowIndex === 2 && (
                  <button
                    className="wide-key"
                    onClick={() => handleVirtualKey("enter")}
                    aria-label="Submit"
                  >
                    Enter
                  </button>
                )}
                {[...row].map((letter) => (
                  <button onClick={() => handleVirtualKey(letter)} key={letter}>
                    {letter}
                  </button>
                ))}
                {rowIndex === 2 && (
                  <button
                    className="wide-key icon-key"
                    onClick={() => handleVirtualKey("backspace")}
                    aria-label="Backspace"
                  >
                    <Icon name="backspace" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="side-column">
          <section className="progress-card">
            <div className="card-heading">
              <span className="mini-flame">🔥</span>
              <div>
                <span>Current run</span>
                <strong>{moves === 0 ? "Ready to burn" : `${moves} move${moves === 1 ? "" : "s"}`}</strong>
              </div>
              <span className="par-pill">PAR {par}</span>
            </div>
            <div className="heat-track">
              <span
                style={{
                  width: `${Math.min(100, Math.max(8, (moves / Math.max(par, 1)) * 100))}%`,
                }}
              />
            </div>
            <div className="progress-meta">
              <span>{hintsUsed} hints</span>
              <span>{Math.max(0, par - moves)} ideal moves left</span>
            </div>
          </section>

          <button className="stats-card" onClick={() => setShowStats(true)}>
            <div className="stats-card-head">
              <span>
                <Icon name="stats" />
                Your spark
              </span>
              <span>View all</span>
            </div>
            <div className="mini-stats">
              <span>
                <strong>{stats.currentStreak}</strong>
                Streak
              </span>
              <span>
                <strong>{stats.wins}</strong>
                Wins
              </span>
              <span>
                <strong>{stats.bestSteps ?? "—"}</strong>
                Best
              </span>
            </div>
          </button>

          <section className="rules-card">
            <span className="side-kicker">HOW TO PLAY</span>
            <h2>Keep the ladder lit.</h2>
            <ol>
              <li>
                <span>1</span>
                Change exactly one letter.
              </li>
              <li>
                <span>2</span>
                Make a valid four-letter word.
              </li>
              <li>
                <span>3</span>
                Reach NONA in as few moves as possible.
              </li>
            </ol>
            <div className="example-route">
              <span>NONE</span>
              <Icon name="arrow" />
              <span className="goal-example">NONA</span>
            </div>
          </section>

          {mode === "endless" && (
            <button
              className="new-word-card"
              onClick={() => resetRound(mode, difficulty, true)}
            >
              <span>
                <strong>Shuffle the sparks</strong>
                Generate another word
              </span>
              <Icon name="shuffle" />
            </button>
          )}
        </aside>
      </div>

      <footer>
        <span>NONA</span>
        <p>A fresh word ladder, forged daily.</p>
        <span>Made for quick minds 🔥</span>
      </footer>

      {showWin && (
        <div className="modal-backdrop" onClick={() => setShowWin(false)}>
          <section
            className="modal win-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowWin(false)}
              aria-label="Close result"
            >
              <Icon name="close" />
            </button>
            <div className="win-flame" aria-hidden="true">
              <FlameLogo />
              <span className="spark spark-one">✦</span>
              <span className="spark spark-two">✦</span>
              <span className="spark spark-three">•</span>
            </div>
            <span className="modal-kicker">
              {moves <= par ? "PERFECT HEAT" : "LADDER COMPLETE"}
            </span>
            <h2 id="win-title">You reached NONA!</h2>
            <p>
              {moves <= par
                ? "You found a shortest possible route. That ladder is blazing."
                : `Solved in ${moves} moves. The shortest route was ${par}.`}
            </p>
            <div className="result-stats">
              <span>
                <strong>{moves}</strong>
                Moves
              </span>
              <span>
                <strong>{par}</strong>
                Par
              </span>
              <span>
                <strong>{hintsUsed}</strong>
                Hints
              </span>
            </div>
            <div className="result-route" aria-label="Completed word route">
              {guesses.map((word, index) => (
                <span key={`${word}-result`}>
                  <strong>{word.toUpperCase()}</strong>
                  {index < guesses.length - 1 && <Icon name="arrow" />}
                </span>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="share-button"
                onClick={() => void shareResult()}
              >
                <Icon name="share" />
                {copied ? "Copied!" : "Share result"}
              </button>
              <button className="next-button" onClick={startNextFromWin}>
                <Icon name="shuffle" />
                {mode === "daily" ? "Play endless" : "New word"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section
            className="modal info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowHelp(false)}
              aria-label="Close how to play"
            >
              <Icon name="close" />
            </button>
            <span className="modal-kicker">HOW TO PLAY</span>
            <h2 id="help-title">Build a word ladder to NONA.</h2>
            <p>
              Start with the word shown and reach <strong>NONA</strong>. Each
              move changes exactly one letter, and every row must be a valid
              four-letter English word.
            </p>
            <div className="help-example">
              {["none", "nona"].map((word, wordIndex) => (
                <div key={word}>
                  {[...word].map((letter, letterIndex) => (
                    <span
                      className={
                        wordIndex === 1 && letterIndex === 3 ? "changed" : ""
                      }
                      key={`${word}-${letterIndex}`}
                    >
                      {letter}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="help-grid">
              <article>
                <span>1</span>
                <div>
                  <strong>One letter only</strong>
                  <p>No adding, removing, or rearranging letters.</p>
                </div>
              </article>
              <article>
                <span>2</span>
                <div>
                  <strong>Use real words</strong>
                  <p>The built-in dictionary checks every move instantly.</p>
                </div>
              </article>
              <article>
                <span>3</span>
                <div>
                  <strong>Beat the par</strong>
                  <p>Par is the shortest possible route for that puzzle.</p>
                </div>
              </article>
              <article>
                <span>4</span>
                <div>
                  <strong>Come back daily</strong>
                  <p>Everyone gets the same daily starting word.</p>
                </div>
              </article>
            </div>
            <button
              className="modal-primary"
              onClick={() => {
                setShowHelp(false);
                inputRef.current?.focus();
              }}
            >
              Start playing <Icon name="arrow" />
            </button>
          </section>
        </div>
      )}

      {showStats && (
        <div className="modal-backdrop" onClick={() => setShowStats(false)}>
          <section
            className="modal info-modal stats-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stats-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowStats(false)}
              aria-label="Close stats"
            >
              <Icon name="close" />
            </button>
            <span className="modal-kicker">YOUR SPARK</span>
            <h2 id="stats-title">NONA stats</h2>
            <p>Your progress is saved privately on this device.</p>
            <div className="stats-grid">
              <span>
                <strong>{stats.played}</strong>
                Played
              </span>
              <span>
                <strong>{winRate}%</strong>
                Win rate
              </span>
              <span>
                <strong>{stats.currentStreak}</strong>
                Streak
              </span>
              <span>
                <strong>{stats.maxStreak}</strong>
                Max streak
              </span>
              <span>
                <strong>{stats.bestSteps ?? "—"}</strong>
                Best route
              </span>
              <span>
                <strong>{averageSteps}</strong>
                Avg. moves
              </span>
            </div>
            <div className="history-block">
              <div className="history-heading">
                <strong>Daily history</strong>
                <span>Best moves</span>
              </div>
              {Object.keys(stats.dailyWins).length ? (
                <div className="history-list">
                  {Object.entries(stats.dailyWins)
                    .sort(([left], [right]) => right.localeCompare(left))
                    .slice(0, 7)
                    .map(([date, steps]) => (
                      <div key={date}>
                        <span>
                          <i>🔥</i>
                          {formatDay(date)}
                        </span>
                        <strong>{steps}</strong>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-history">
                  Finish today’s puzzle to light your first streak.
                </div>
              )}
            </div>
            <button
              className="modal-primary"
              onClick={() => setShowStats(false)}
            >
              Back to game <Icon name="arrow" />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
