import { processSopIngestionJob } from "../../services/sop";
import type { Job } from "../../services/queue";

type SopIngestionJobData = {
  sopDocumentId: string;
};

export async function processSopIngest(
  job: Job<SopIngestionJobData>,
): Promise<void> {
  await processSopIngestionJob({
    sopDocumentId: job.data.sopDocumentId,
  });
}
