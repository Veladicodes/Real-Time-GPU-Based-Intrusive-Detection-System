// Defer non-critical animations to idle time
window.requestIdleCallback?.(() => {
  document.querySelectorAll(".motion-ready")?.forEach((el) => el.classList.add("animate"))
})

