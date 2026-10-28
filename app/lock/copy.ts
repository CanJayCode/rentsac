// Lock-screen wording. Plain English for now; Task 8 moves this into i18n.

export const lockCopy = {
  appName: "Rentsac",
  unlockTitle: "Enter your PIN",
  unlockHint: "Six digits to open the building's accounts.",
  chooseTitle: "Choose a PIN",
  chooseHint: "Pick six digits you will remember. You will use them each time you open Rentsac.",
  confirmTitle: "Confirm PIN",
  confirmHint: "Enter the same six digits again.",
  codeTitle: "Enter the setup code",
  codeHint: "This is a new install. Type the setup code you were given, then choose a PIN.",
  codeLabel: "Setup code",
  codeContinue: "Continue",
  wrongPin: "That PIN is not right. Try again.",
  mismatch: "The two PINs did not match. Choose again.",
  wrongCode: "That setup code is not right. Check it and try again.",
  alreadySet: "A PIN is already set. Enter it to open Rentsac.",
  notSet: "No PIN is set yet. Choose one first.",
  lockedTitle: "Too many wrong tries",
  lockedRetry: (minutes: number) =>
    minutes <= 1 ? "Try again in 1 minute." : `Try again in ${minutes} minutes.`,
  opening: "Opening…",
  failed: "Something went wrong. Try again.",
  deleteKey: "Delete last digit",
  digitsEntered: (n: number) => `${n} of 6 digits entered`,
} as const;
