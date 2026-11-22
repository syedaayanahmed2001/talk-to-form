import { TalkToForm } from "@/components/talk-to-form";

const REPO = "https://github.com/syedaayanahmed2001/talk-to-form";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">talk-to-form</h1>
        <p className="max-w-2xl text-muted">
          Say what happened at work, in any language. The recording is transcribed, a language model fills
          in an incident report in formal German or English, and you check every field against the words
          it came from before the record is final.
        </p>
      </header>

      <TalkToForm />

      <footer className="mt-12 border-t border-border pt-4 text-sm text-muted">
        <p>
          Open source (MIT) by Syed Aayan Ahmed. Built spec first:{" "}
          <a className="underline underline-offset-2 hover:text-text" href={`${REPO}/blob/main/docs/SPEC.md`}>
            read the specification
          </a>{" "}
          or{" "}
          <a className="underline underline-offset-2 hover:text-text" href={REPO}>
            the code
          </a>
          . All names in the samples are fictional.
        </p>
      </footer>
    </main>
  );
}
