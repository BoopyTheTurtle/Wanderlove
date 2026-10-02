import { BUILD_ID } from "../lib/appVersion";
import { sendAppReview } from "../lib/testerFeedback";
import type { ReviewFields } from "./feedbackState";

// Sends a review from Profile with the version of the build that sent it (undefined in dev).
export function sendTesterReview(review: ReviewFields): Promise<void> {
  return sendAppReview(review, BUILD_ID);
}
