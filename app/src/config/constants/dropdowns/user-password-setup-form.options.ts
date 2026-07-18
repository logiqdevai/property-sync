export const UserPasswordSetupModes = {
  INVITE: "invite",
  MANUAL: "manual",
} as const;

export type UserPasswordSetupMode =
  (typeof UserPasswordSetupModes)[keyof typeof UserPasswordSetupModes];

export const UserPasswordSetupFormOptions: {
  id: UserPasswordSetupMode;
  label: string;
}[] = [
  { id: UserPasswordSetupModes.INVITE, label: "Send invite email" },
  { id: UserPasswordSetupModes.MANUAL, label: "Set password now" },
];
