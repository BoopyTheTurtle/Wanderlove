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
          <p className="tester-notice-version">Version tester-v3 · October 2, 2026</p>
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
            <li>Your couple name and points, once you link with a partner</li>
            <li>Your task votes and feedback, if you give any</li>
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
              If you both join the weekly leaderboard, about 30 other couples see your couple name and this week&rsquo;s
              points, as described under &ldquo;Weekly leaderboard&rdquo;.
            </li>
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

          <h2>Weekly leaderboard</h2>
          <p>
            The leaderboard is opt-in: your couple joins only when both of you say yes. Either of you can leave alone,
            at any time, and that takes your couple off the board at once.
          </p>
          <p>
            Each week the app draws leagues of about 30 couples at random. The other couples in your league see two
            things about you: your couple name and this week&rsquo;s points, which add up your three best quests
            finished this week. They see no rank, display names, avatars, locations, or photos, and nothing on the board
            links anywhere. A couple without a name stays off the board.
          </p>

          <h2>Feedback</h2>
          <p>
            If you vote on a task or write to me, I store your vote or words with your account, the app version, and the
            day, but never the trail, place, or partner. I read feedback without names, and a task&rsquo;s votes stay
            hidden until three testers have voted on it. Deleting your account deletes your feedback. I delete all
            feedback when testing ends.
          </p>

          <h2>Deleting photos</h2>
          <p>
            You can delete your own photos. A deleted photo disappears from the app for your partner too. Copies either
            of you already saved to a phone stay there.
          </p>

          <h2>If you unlink</h2>
          <p>Each of you keeps the photos from trails you walked together.</p>
          <p>
            Unlinking takes your couple off the leaderboard at once. The server keeps your couple name, points, and
            quest totals for 90 days after the unlink, then deletes them. If the same two people link again within those
            90 days, these move to the new couple; the leaderboard still needs both of you to say yes again.
          </p>

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
