/** 保留可能跨 chunk 的前缀，避免日志分块导致原始凭据泄漏。 */
export function secretRedactor(values: string[], emit: (text: string) => void) {
  const secrets = [
    ...new Set(
      values.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let pending = '';
  const flush = (final: boolean) => {
    let output = '';
    while (pending) {
      if (
        !final &&
        secrets.some(
          (secret) =>
            secret.length > pending.length && secret.startsWith(pending),
        )
      )
        break;
      const match = secrets.find((secret) => pending.startsWith(secret));
      if (match) {
        output += '[已隐藏]';
        pending = pending.slice(match.length);
      } else {
        output += pending[0];
        pending = pending.slice(1);
      }
    }
    if (output) emit(output);
  };
  return {
    write(text: string) {
      pending += text;
      flush(false);
    },
    end() {
      flush(true);
    },
  };
}
