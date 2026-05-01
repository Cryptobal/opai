"use client";

import { useState } from "react";
import {
  Check,
  X,
  Clock,
  AlertTriangle,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type TicketApproval,
  type TicketApprovalStatus,
  APPROVAL_STATUS_CONFIG,
} from "@/lib/tickets";

interface TicketApprovalTimelineProps {
  approvals: TicketApproval[];
  currentStep: number | null;
  approvalStatus: TicketApprovalStatus | null;
  userGroupIds: string[]; // groups the current user belongs to
  userId: string;
  onApprove: (approvalId: string, comment?: string) => void;
  onReject: (approvalId: string, comment: string) => void;
}

/**
 * Vertical timeline that shows the approval chain for a ticket.
 * Each step is a circle on the left connected by lines, with details on the right.
 */
export function TicketApprovalTimeline({
  approvals,
  currentStep,
  approvalStatus,
  userGroupIds,
  userId,
  onApprove,
  onReject,
}: TicketApprovalTimelineProps) {
  const [commentByStep, setCommentByStep] = useState<Record<string, string>>({});

  const sorted = [...approvals].sort((a, b) => a.stepOrder - b.stepOrder);
  const totalSteps = sorted.length;

  // Determine if the current user can approve a given step
  function canUserDecide(approval: TicketApproval): boolean {
    if (approval.decision !== "pending") return false;
    if (approval.stepOrder !== currentStep) return false;
    if (approval.approverType === "user") {
      return approval.approverUserId === userId;
    }
    return (
      approval.approverGroupId != null &&
      userGroupIds.includes(approval.approverGroupId)
    );
  }

  // Overall status banner
  function renderStatusBanner() {
    if (!approvalStatus) return null;

    if (approvalStatus === "pending" && currentStep != null) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-status-warn-border bg-status-warn-soft px-3 py-2">
          <Clock className="h-4 w-4 text-status-warn-fg shrink-0" />
          <span className="text-sm text-status-warn-fg dark:text-status-warn-fg">
            Pendiente de aprobación (paso {currentStep} de {totalSteps})
          </span>
        </div>
      );
    }

    if (approvalStatus === "approved") {
      return (
        <div className="flex items-center gap-2 rounded-md border border-status-ok-border bg-status-ok-soft px-3 py-2">
          <Check className="h-4 w-4 text-status-ok-fg shrink-0" />
          <span className="text-sm text-status-ok-fg dark:text-status-ok-fg">
            Aprobado
          </span>
        </div>
      );
    }

    if (approvalStatus === "rejected") {
      return (
        <div className="flex items-center gap-2 rounded-md border border-status-danger-border bg-status-danger-soft px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-status-danger-fg shrink-0" />
          <span className="text-sm text-status-danger-fg dark:text-status-danger-fg">
            Rechazado
          </span>
        </div>
      );
    }

    return null;
  }

  // Render the circle icon for a step
  function renderStepIcon(approval: TicketApproval) {
    if (approval.decision === "approved") {
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-status-ok text-white shrink-0">
          <Check className="h-4 w-4" />
        </div>
      );
    }

    if (approval.decision === "rejected") {
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-status-danger text-white shrink-0">
          <X className="h-4 w-4" />
        </div>
      );
    }

    // Pending
    if (approval.stepOrder === currentStep && approvalStatus === "pending") {
      // Current / waiting — blue pulsing dot
      return (
        <div className="relative flex h-7 w-7 items-center justify-center shrink-0">
          <div className="absolute h-7 w-7 rounded-full bg-status-info-soft animate-ping" />
          <div className="relative h-3.5 w-3.5 rounded-full bg-status-info" />
        </div>
      );
    }

    // Future pending — gray dot
    return (
      <div className="flex h-7 w-7 items-center justify-center shrink-0">
        <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
      </div>
    );
  }

  function handleCommentChange(approvalId: string, value: string) {
    setCommentByStep((prev) => ({ ...prev, [approvalId]: value }));
  }

  function handleApproveClick(approvalId: string) {
    const comment = commentByStep[approvalId]?.trim() || undefined;
    onApprove(approvalId, comment);
  }

  function handleRejectClick(approvalId: string) {
    const comment = commentByStep[approvalId]?.trim();
    if (!comment) return; // Reject requires a comment
    onReject(approvalId, comment);
  }

  return (
    <div className="space-y-3">
      {/* Section title */}
      <h4 className="text-sm font-medium">Cadena de aprobación</h4>

      {/* Overall status banner */}
      {renderStatusBanner()}

      {/* Timeline */}
      <div className="relative ml-1">
        {sorted.map((approval, idx) => {
          const isLast = idx === sorted.length - 1;
          const showActions = canUserDecide(approval);
          const comment = commentByStep[approval.id] ?? "";
          const statusCfg = APPROVAL_STATUS_CONFIG[approval.decision];

          return (
            <div key={approval.id} className="relative flex gap-3">
              {/* Vertical line */}
              {!isLast && (
                <div
                  className="absolute left-[13px] top-7 w-px bg-border"
                  style={{ height: "calc(100% - 4px)" }}
                />
              )}

              {/* Circle icon */}
              {renderStepIcon(approval)}

              {/* Content */}
              <div className={`flex-1 pb-5 ${isLast ? "pb-0" : ""}`}>
                {/* Step header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {approval.stepLabel}
                  </span>
                  <Badge variant={statusCfg.variant} className="text-[10px]">
                    {statusCfg.label}
                  </Badge>
                </div>

                {/* Approver info */}
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {approval.approverType === "group" ? (
                    <>
                      <Users className="h-3 w-3" />
                      <span>{approval.approverGroupName ?? "Grupo"}</span>
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3" />
                      <span>{approval.approverUserName ?? "Usuario"}</span>
                    </>
                  )}
                </div>

                {/* Decision details (if decided) */}
                {approval.decision !== "pending" && approval.decidedByName && (
                  <div className="mt-1.5 rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="font-medium">{approval.decidedByName}</span>
                      {approval.decidedAt && (
                        <span>
                          {new Date(approval.decidedAt).toLocaleString("es-CL")}
                        </span>
                      )}
                    </div>
                    {approval.comment && (
                      <p className="text-foreground whitespace-pre-wrap">
                        {approval.comment}
                      </p>
                    )}
                  </div>
                )}

                {/* Action buttons (if current user can decide) */}
                {showActions && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                      rows={2}
                      placeholder="Comentario (obligatorio para rechazar)..."
                      value={comment}
                      onChange={(e) =>
                        handleCommentChange(approval.id, e.target.value)
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleApproveClick(approval.id)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        disabled={!comment.trim()}
                        onClick={() => handleRejectClick(approval.id)}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Rechazar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
