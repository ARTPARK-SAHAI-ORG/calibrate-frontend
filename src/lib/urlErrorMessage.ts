/**
 * Turns the backend's refusal of a webhook or agent address into words for the
 * reader. Matched on key words rather than the exact sentence, so a reworded
 * backend message still reads well; anything it does not recognise comes back
 * unchanged.
 */
export function friendlyUrlError(message: string): string {
  if (!/url/i.test(message)) return message;
  if (/localhost|loopback|private|reserved|internal/i.test(message)) {
    return "This URL points to a private or internal network address. Use a public URL that can be reached from the internet.";
  }
  if (/resolv|not found|could not find/i.test(message)) {
    return "This URL could not be found. Check that it is spelled correctly and can be reached from the internet.";
  }
  if (/http/i.test(message)) {
    return "This URL must start with http:// or https://";
  }
  if (/host/i.test(message)) {
    return "This URL is missing the website address. Enter a full URL, such as https://api.example.com/orders.";
  }
  return message;
}
