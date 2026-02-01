async function restoreSession(page, sessionData) {
  const { cookies, localStorage, sessionStorage } = sessionData;

  await page.setCookie(...cookies);

  await page.evaluate((localStorage) => {
    for (const [key, value] of Object.entries(localStorage)) {
      window.localStorage.setItem(key, value);
    }
  }, localStorage);

  await page.evaluate((sessionStorage) => {
    for (const [key, value] of Object.entries(sessionStorage)) {
      window.sessionStorage.setItem(key, value);
    }
  }, sessionStorage);
}

module.exports = restoreSession;
