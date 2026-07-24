import { StatusBadge, type BadgeTone } from "./StatusBadge";
import { requestStatusLabels, type RequestStatus } from "../../lib/types";

const tone: Record<RequestStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <StatusBadge tone={tone[status]}>{requestStatusLabels[status]}</StatusBadge>;
}
