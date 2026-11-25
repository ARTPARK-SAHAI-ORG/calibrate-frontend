import { CONTACT_LINK } from "@/constants/limits";

export function ExtendLimitsLink() {
  return (
    <>
      <a
        href={CONTACT_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold"
      >
        Click here
      </a>{" "}
      to contact us to extend your limits.
    </>
  );
}
