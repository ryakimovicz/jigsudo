export function showToast(message, duration = 3000) {
  let container = document.getElementById("toast-container");

  // Create container if missing
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  // Create Toast Element
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.textContent = message;

  container.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, duration);
}

export function formatTime(ms) {
  if (ms === undefined || ms === null || isNaN(ms) || ms === Infinity) {
    return "--:--";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
}
