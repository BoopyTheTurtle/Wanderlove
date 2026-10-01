import { BrandMark, PhoneFrame, StatusBar } from "../components/PhoneFrame";
import "../tester-notice.css";

const PRIVACY_EMAIL = "privacy@wannadoo.app";

function Email() {
  return <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;
}

export function TesterNotice() {
  return (
    <PhoneFrame>
      <div className="screen tester-notice">
        <StatusBar />
        <header className="tester-notice-head">
          <p className="wordmark">
            <BrandMark /> Wannadoo
          </p>
          <h1>Tester notice</h1>
          <p className="tester-notice-version">Version tester-v1 · September 29, 2026</p>
        </header>

        <article className="card tester-notice-body">
          <p>
            Wannadoo is a city-walk app for couples. You are one of 10 to 20 people I have invited to test it before
            launch. This notice explains what data the test collects, why, and what you can do about it. You must be 18
            or older to take part.
          </p>

          <h2>Who is responsible</h2>
          <p>
            I, Edgars Stillers, live in Latvia and control your data. Write to <Email /> with any question about it.
          </p>

          <h2>What I collect</h2>
          <ul>
            <li>Your email address</li>
            <li>Your display name</li>
            <li>The stops you complete</li>
            <li>Your photos</li>
          </ul>
          <p>
            Your GPS position stays on your phone, except as described under &ldquo;Who sees your data&rdquo;. The app
            removes location data (EXIF) from every photo before uploading it.
          </p>
          <p>
            Your phone encrypts the photos from new trails before uploading them, so only you and your partner can open
            them, not me or Supabase. On a new phone, your recovery code (under Profile) or your partner&rsquo;s phone
            unlocks them again; without either, they are lost.
          </p>

          <h2>Why</h2>
          <p>
            I use your data to test the app. The lawful basis is legitimate interests: I share the app&rsquo;s address
            only with people I have asked to test it.
          </p>

          <h2>Who sees your data</h2>
          <ul>
            <li>Your linked partner sees the trails you walk together and their photos.</li>
            <li>
              Three companies process your data for me: Supabase stores the database and photos in Frankfurt (EU),
              Vercel hosts the app, and Resend sends sign-in emails from its EU region. Supabase and Vercel are US
              companies; where your data reaches the US, their contracts rely on the EU&ndash;US Data Privacy Framework
              and the EU Standard Contractual Clauses.
            </li>
            <li>
              When the app builds a route, it sends your position to Overpass, FOSSGIS, and OpenStreetMap to find places
              and walking paths.
            </li>
            <li>
              When you report a stop as unsafe or unpleasant, the app sends that stop&rsquo;s position and your note to
              Wannadoo for review. It doesn&rsquo;t send your start or your route.
            </li>
          </ul>

          <h2>Deleting photos</h2>
          <p>
            You can delete your own photos. A deleted photo disappears from the app for your partner too. Copies either
            of you already saved to a phone stay there.
          </p>

          <h2>If you unlink</h2>
          <p>Each of you keeps the photos from trails you walked together.</p>

          <h2>How long I keep it</h2>
          <p>I keep your data until the test ends and delete all test data before public launch.</p>
          <p>
            Photos go sooner: the server deletes a trail&rsquo;s photos one month after the trail ends, and a trail left
            open counts as ended one month after it started. Save the photos you want to keep to your phone before then.
          </p>

          <h2>Your rights</h2>
          <p>
            Email <Email /> to see, correct, or delete your data, or to object to how I use it. I answer within one
            month.
          </p>

          <h2>Complaints</h2>
          <p>
            You can complain to Latvia&rsquo;s Data State Inspectorate (Datu valsts inspekcija,{" "}
            <a href="https://www.dvi.gov.lv" target="_blank" rel="noreferrer">
              dvi.gov.lv
            </a>
            ). Testers in the UK can also go to the Information Commissioner&rsquo;s Office (
            <a href="https://ico.org.uk" target="_blank" rel="noreferrer">
              ico.org.uk
            </a>
            ).
          </p>
        </article>

        <a className="tester-notice-back" href="/">
          Back to Wannadoo
        </a>
      </div>
    </PhoneFrame>
  );
}
