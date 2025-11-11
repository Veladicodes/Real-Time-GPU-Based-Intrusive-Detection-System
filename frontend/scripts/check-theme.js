#!/usr/bin/env node

/**
 * Simple guard to ensure disallowed colors do not creep into the codebase.
 */

const { readFileSync, readdirSync, statSync } = require("fs")
const { join, extname } = require("path")

const ROOT = join(__dirname, "..")
const FORBIDDEN = [/#[0-9a-fA-F]{6}/g]
const ALLOWED = new Set([
  "#f35b04",
  "#0f0f0f",
  "#0b0b0b",
  "#111111",
  "#141414",
  "#e9e9e9",
  "#e5e5e5",
  "#f2f2f2",
  "#5a5a5a",
  "#2b2b2b",
  "#66615a",
  "#e6e6e6",
  "#ffffff",
  "#fff",
  "#000000",
  "#000",
  "#ff8800",
  "#ff2e00",
  "#4cff85",
  "#09090b",
  "#d97706",
  "#00fff0",
  "#c8f9ff",
  "#7efbff",
  "#ff0000",
  "#ff002b",
  "#f7a600",
  "#bb86fc",
  "#e7dbff",
  "#c8b6ff",
  "#a56df4",
  "#00ffc3",
  "#007aff",
  "#32ff7e",
  "#7bffb0",
  "#e4ffe9",
  "#2ae070",
  "#00ff8c",
  "#ffcc33",
  "#ff3b3b",
])
const IGNORE_DIRS = new Set(["node_modules", ".pnpm", "dist", ".next", ".git", "public/fonts"])

let violations = []

function walk(dir) {
  if (IGNORE_DIRS.has(dir)) return
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (IGNORE_DIRS.has(entry)) continue
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      walk(fullPath)
    } else if (stats.isFile() && [".ts", ".tsx", ".js", ".jsx", ".css"].includes(extname(entry))) {
      const content = readFileSync(fullPath, "utf8")
      const matches = content.match(FORBIDDEN[0]) || []
      matches.forEach((hex) => {
        if (!ALLOWED.has(hex.toLowerCase())) {
          violations.push({ file: fullPath.replace(ROOT, "."), hex })
        }
      })
    }
  }
}

walk(ROOT)

if (violations.length) {
  console.error("Forbidden theme colors detected:")
  violations.forEach((v) => console.error(`- ${v.hex} in ${v.file}`))
  process.exit(1)
}

console.log("Theme color check passed.")


