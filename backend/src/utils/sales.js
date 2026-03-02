function proposeShift(date = new Date()) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const current = hour * 60 + minute;
  const morningCutoff = 11 * 60;
  const afternoonCutoff = 19 * 60 + 30;
  if (current < morningCutoff) return "MANIANA";
  if (current < afternoonCutoff) return "TARDE";
  return "MANIANA";
}

function buildSaleNumber() {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `VTA-${d}-${rand}`;
}

module.exports = { proposeShift, buildSaleNumber };
