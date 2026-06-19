"use client";

import { useEffect, useRef, useState } from "react";
import { Smile, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free emoji picker: category tabs + a "recent" row (localStorage),
 * click to insert. Sending an emoji is just unicode text, so the composer
 * appends the character to the draft — Signal renders it natively.
 */

const RECENTS_KEY = "rokki:emoji:recent";

const CATEGORIES: { key: string; label: string; emoji: string; items: string[] }[] = [
  {
    key: "smileys",
    label: "Smileys",
    emoji: "😀",
    items: "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕".split(" "),
  },
  {
    key: "gestures",
    label: "Gestures",
    emoji: "👍",
    items: "👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 🤟 🤘 👌 🤌 🤏 ✌️ 🤞 🫰 🫶 🫵 👆 🖕 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝".split(" "),
  },
  {
    key: "people",
    label: "People",
    emoji: "🧑",
    items: "👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🧔 👮 🕵️ 💂 👷 🤴 👸 👳 👲 🧕 🤵 👰 🤰 🤱 👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🏃 💃 🕺 🧗 🤺 🏇 ⛷️ 🏂 🏌️ 🏄 🚣 🏊 ⛹️ 🏋️ 🚴 🤸 🤼 🤽 🤾 🤹 🧘".split(" "),
  },
  {
    key: "animals",
    label: "Animals",
    emoji: "🐶",
    items: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🐪 🐫 🦒 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🕊️ 🐇 🐁 🐀 🐿️ 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🎍 🌾 🌷 🌹 🥀 🌺 🌸 🌼 🌻".split(" "),
  },
  {
    key: "food",
    label: "Food",
    emoji: "🍎",
    items: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🍾".split(" "),
  },
  {
    key: "activities",
    label: "Activities",
    emoji: "⚽",
    items: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩".split(" "),
  },
  {
    key: "travel",
    label: "Travel",
    emoji: "🚗",
    items: "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚀 🛸 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🗺️ 🗽 🗿 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉".split(" "),
  },
  {
    key: "objects",
    label: "Objects",
    emoji: "💡",
    items: "⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📟 📠 📺 📻 🎙️ ⏰ ⏱️ ⏲️ 🕰️ 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🏺 🔮 📿 🧿 💈 🔭 🔬 🕳️ 💊 💉 🩸 🌡️ 🧹 🧺 🧻 🚽 🚿 🛁 🧼 🪥 🧽 🔑 🗝️ 🚪 🛋️ 🛏️ 🖼️ 🛍️ 🎁 🎈 🎏 🎀 🎊 🎉 🧧 ✉️ 📩 📨 📧 📦 📫 📪 📬 📭 📮 📯 📜 📃 📄 📑 📊 📈 📉 🗒️ 📅 📆 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 ✏️ ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 ✂️ 📌 📍 📎 🖇️ 📏 📐".split(" "),
  },
  {
    key: "symbols",
    label: "Symbols",
    emoji: "✅",
    items: "✅ ❌ ❎ ✔️ ☑️ 🔘 ⭕ 🚫 ⛔ 📛 💯 ❗ ❓ ❕ ❔ ‼️ ⁉️ 🔅 🔆 ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✳️ ❇️ ✴️ 💠 Ⓜ️ 🌐 💢 🔥 ✨ 💫 ⭐ 🌟 ⚡ ☄️ 💥 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 💨 💧 💦 ☔ ☂️ 🌊 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 🔞 📵 🚭 ❎ 🆎 🆑 🆘 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 🔠 🔡 🔢 🔣 🔤 🅰️ 🆎".split(" "),
  },
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState("smileys");
  const [recent, setRecent] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[];
      setRecent(Array.isArray(r) ? r.slice(0, 24) : []);
    } catch {
      setRecent([]);
    }
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const pick = (emoji: string) => {
    onPick(emoji);
    setRecent((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 24);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const active = CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[0];
  const items =
    cat === "recent" ? recent : active.items;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-md border border-border bg-bg-1 shadow-lg"
    >
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="col-span-8 py-6 text-center text-2xs text-text-3">
            No recent emojis yet.
          </p>
        ) : (
          items.map((e, i) => (
            <button
              key={`${e}-${i}`}
              type="button"
              onClick={() => pick(e)}
              className="flex h-6 w-6 items-center justify-center rounded text-base hover:bg-bg-2"
            >
              {e}
            </button>
          ))
        )}
      </div>
      <div className="flex items-center gap-0.5 border-t border-border bg-bg-0 px-1 py-1">
        <button
          type="button"
          onClick={() => setCat("recent")}
          title="Recent"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded hover:bg-bg-2",
            cat === "recent" ? "text-accent" : "text-text-3",
          )}
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            title={c.label}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-bg-2",
              cat === c.key ? "bg-bg-2" : "",
            )}
          >
            {c.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The trigger button + popover wrapper. */
export function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Emoji"
        aria-label="Insert emoji"
        className="flex h-full items-center rounded-sm border border-border bg-bg-0 px-2 text-text-2 hover:text-text-0"
      >
        <Smile className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <EmojiPicker
          onPick={(e) => onPick(e)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
