"use strict"

/* eslint-disable no-console */

const url = "http://localhost:3000"
const opts = {
  chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  onlyCategories: ["performance", "accessibility", "best-practices"],
}

async function runAudit() {
  const { launch } = await import("chrome-launcher")
  const { default: lighthouse } = await import("lighthouse")

  const chrome = await launch({ chromeFlags: opts.chromeFlags })
  const runnerResult = await lighthouse(url, opts)

  const performance = runnerResult.lhr.categories.performance.score * 100
  const accessibility = runnerResult.lhr.categories.accessibility.score * 100
  const bestPractices = runnerResult.lhr.categories["best-practices"].score * 100

  console.log("✅ Performance:", performance)
  console.log("✅ Accessibility:", accessibility)
  console.log("✅ Best Practices:", bestPractices)

  await chrome.kill()

  if (performance < 90 || accessibility < 90) {
    throw new Error("❌ Lighthouse audit failed. Fix contrast/animation before merging.")
  }
}

runAudit().catch((error) => {
  console.error(error)
  process.exit(1)
})


