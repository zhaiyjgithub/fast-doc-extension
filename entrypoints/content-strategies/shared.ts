export function isMdlandEclinicHost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  const mdlandCom = `${"mdland"}.${"com"}`;
  return lowered.endsWith(".mdland.net") || lowered.endsWith(`.${mdlandCom}`);
}

export function getWorkareaTokenFromPath(path: string): string | null {
  const matched = path.match(/workarea\d+/i);
  return matched?.[0]?.toLowerCase() ?? null;
}
