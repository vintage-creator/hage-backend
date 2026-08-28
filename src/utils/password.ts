// src/utils/password.ts
export const isStrongPassword = (pwd: string): boolean => {
   const lengthOk = pwd.length >= 8;
   const hasLetter = /[A-Za-z]/.test(pwd);
   const hasNumber = /[0-9]/.test(pwd);
   const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-\\[\]\\/~`+=;'']/g.test(pwd);

   return lengthOk && hasLetter && hasNumber && hasSpecial;
};
