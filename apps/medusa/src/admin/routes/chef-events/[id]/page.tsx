import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, toast, Button, FocusModal, Textarea, Label, Checkbox, Input, Text } from "@medusajs/ui"
import { useNavigate, useParams, type UIMatch } from "react-router-dom"
import { useState } from "react"
import { DateTime } from "luxon"
import { requestedStartInEventZone } from "../../../../lib/chef-event-datetime-display"
import { ChefEventForm } from "../components/chef-event-form"
import { MenuDetails } from "../components/menu-details"
import { EmailManagementSection } from "../components/EmailManagementSection"
import {
  useAdminRetrieveChefEvent,
  useAdminUpdateChefEventMutation,
  useAdminAcceptChefEventMutation,
  useAdminRejectChefEventMutation,
  useAdminSendReceiptMutation,
  useAdminDeriveChefEventMenuMutation,
  useAdminRevertChefEventMenuMutation,
} from "../../../hooks/chef-events"
import type { AdminChefEventDTO } from "../../../../sdk/admin/admin-chef-events"

const chefEventDisplayName = (event: AdminChefEventDTO) => {
  const parts = [event.firstName, event.lastName].filter(Boolean)
  const name = parts.join(" ").trim()
  return name.length > 0 ? name : event.email
}

const ChefEventDetailBreadcrumb = (props: UIMatch<unknown>) => {
  const id = props.params?.id as string | undefined
  const { data: chefEvent } = useAdminRetrieveChefEvent(id ?? "", { enabled: Boolean(id) })
  if (!chefEvent) {
    return null
  }
  return <span>{chefEventDisplayName(chefEvent)}</span>
}

const ChefEventDetailPage = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: chefEvent, isLoading } = useAdminRetrieveChefEvent(id!)
  const updateChefEvent = useAdminUpdateChefEventMutation(id!)
  const acceptChefEvent = useAdminAcceptChefEventMutation()
  const rejectChefEvent = useAdminRejectChefEventMutation()
  const sendReceipt = useAdminSendReceiptMutation()
  const deriveChefEventMenu = useAdminDeriveChefEventMenuMutation()
  const revertChefEventMenu = useAdminRevertChefEventMenuMutation()
  
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [chefNotes, setChefNotes] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")
  const [sendAcceptanceEmail, setSendAcceptanceEmail] = useState(true)
  const [receiptTipAmount, setReceiptTipAmount] = useState("")
  const [receiptTipMethod, setReceiptTipMethod] = useState<string>("")
  const [receiptTipMethodOther, setReceiptTipMethodOther] = useState("")
  const [receiptNotes, setReceiptNotes] = useState("")
  const [receiptDuplicateConfirmed, setReceiptDuplicateConfirmed] = useState(false)
  const [showRevertMenuModal, setShowRevertMenuModal] = useState(false)
  const [deleteDerivedMenuOnRevert, setDeleteDerivedMenuOnRevert] = useState(false)

  const handleUpdateChefEvent = async (data: any) => {
    try {
      await updateChefEvent.mutateAsync(data)
      toast.success("Chef Event Updated", {
        description: "The chef event has been updated successfully.",
        duration: 3000,
      })
    } catch (error) {
      console.error("Error updating chef event:", error)
      toast.error("Update Failed", {
        description: "There was an error updating the chef event. Please try again.",
        duration: 5000,
      })
    }
  }

  const handleAcceptEvent = async () => {
    try {
      await acceptChefEvent.mutateAsync({ 
        id: id!, 
        data: { 
          chefNotes: chefNotes || undefined,
          sendAcceptanceEmail: sendAcceptanceEmail
        }
      })
      toast.success("Event Accepted", {
        description: "The event has been accepted and a product has been created for ticket sales.",
        duration: 5000,
      })
      setShowAcceptModal(false)
      setChefNotes("")
      setSendAcceptanceEmail(true)
    } catch (error) {
      console.error("Error accepting chef event:", error)
      toast.error("Acceptance Failed", {
        description: "There was an error accepting the chef event. Please try again.",
        duration: 5000,
      })
    }
  }

  const handleRejectEvent = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Rejection Reason Required", {
        description: "Please provide a reason for rejecting this event.",
        duration: 3000,
      })
      return
    }

    try {
      await rejectChefEvent.mutateAsync({ 
        id: id!, 
        data: { 
          rejectionReason: rejectionReason.trim(),
          chefNotes: chefNotes || undefined
        }
      })
      toast.success("Event Rejected", {
        description: "The event has been rejected and the customer has been notified.",
        duration: 5000,
      })
      setShowRejectModal(false)
      setRejectionReason("")
      setChefNotes("")
    } catch (error) {
      console.error("Error rejecting chef event:", error)
      toast.error("Rejection Failed", {
        description: "There was an error rejecting the chef event. Please try again.",
        duration: 5000,
      })
    }
  }

  const handleCustomizeEventMenu = async () => {
    try {
      const result = await deriveChefEventMenu.mutateAsync(id!)
      toast.success(
        result.created ? "Event Menu Created" : "Opening existing event menu",
        {
          description: result.created
            ? "A draft menu was created from the template for this event."
            : "This event already has a custom menu draft.",
          duration: 3000,
        }
      )
      if (result.menu?.id) {
        navigate(`/menus/${result.menu.id}`)
      }
    } catch (error) {
      console.error("Error deriving event menu:", error)
      toast.error("Menu Derivation Failed", {
        description: "There was an error preparing the event menu. Please try again.",
        duration: 5000,
      })
    }
  }

  const handleRevertEventMenu = async () => {
    try {
      const result = await revertChefEventMenu.mutateAsync({
        chefEventId: id!,
        deleteDerivedMenu: deleteDerivedMenuOnRevert,
      })
      toast.success("Event Menu Reverted", {
        description: result.deletedDerivedMenu
          ? "Reverted to the initial menu and deleted the derived menu."
          : "Reverted to the initial menu. Derived menu was kept.",
        duration: 3000,
      })
      setShowRevertMenuModal(false)
      setDeleteDerivedMenuOnRevert(false)
    } catch (error) {
      console.error("Error reverting event menu:", error)
      toast.error("Revert Failed", {
        description: "There was an error reverting the menu. Please try again.",
        duration: 5000,
      })
    }
  }

  if (isLoading) {
    return (
      <Container className="p-6">
        <div>Loading...</div>
      </Container>
    )
  }

  if (!chefEvent) {
    return (
      <Container className="p-6">
        <div>Chef event not found</div>
      </Container>
    )
  }

  const isPending = chefEvent.status === 'pending'
  const isConfirmed = chefEvent.status === 'confirmed'

  const requestedDateRaw = chefEvent.requestedDate as string | Date | undefined
  const eventStart =
    requestedDateRaw == null
      ? null
      : requestedStartInEventZone({
          requestedDate: requestedDateRaw,
          timeZone: chefEvent.timeZone,
        })
  const eventDay =
    eventStart && eventStart.isValid ? eventStart.startOf("day") : null
  const eventTz = eventDay?.zoneName ?? chefEvent.timeZone ?? "America/Chicago"
  const hasEventTakenPlace =
    eventDay != null &&
    eventDay < DateTime.now().setZone(eventTz).startOf("day")

  const availableTickets =
    typeof chefEvent.availableTickets === "number" ? chefEvent.availableTickets : undefined
  const soldOut = availableTickets === 0
  const canSendReceipt =
    isConfirmed &&
    Boolean(chefEvent.productId) &&
    (hasEventTakenPlace || soldOut)

  const emailHistory = chefEvent.emailHistory as
    | Array<{ type?: string }>
    | undefined
  const alreadySentReceipt = emailHistory?.some((e) => e.type === "receipt")

  const resetReceiptModal = () => {
    setReceiptTipAmount("")
    setReceiptTipMethod("")
    setReceiptTipMethodOther("")
    setReceiptNotes("")
    setReceiptDuplicateConfirmed(false)
  }

  const handleSendReceipt = async () => {
    const amountRaw = receiptTipAmount.trim()
    const tipAmount =
      amountRaw === "" ? undefined : Number.parseFloat(amountRaw)
    if (amountRaw !== "" && (Number.isNaN(tipAmount!) || tipAmount! < 0)) {
      toast.error("Invalid tip", { description: "Enter a valid non-negative amount or leave blank." })
      return
    }
    let tipMethod: string | undefined
    if (tipAmount != null && tipAmount > 0) {
      if (receiptTipMethod === "other") {
        const o = receiptTipMethodOther.trim()
        if (!o) {
          toast.error("Tip method required", { description: "Describe how gratuity was received." })
          return
        }
        tipMethod = o
      } else if (receiptTipMethod) {
        tipMethod =
          receiptTipMethod === "cash"
            ? "Cash"
            : receiptTipMethod.charAt(0).toUpperCase() + receiptTipMethod.slice(1)
      } else {
        toast.error("Tip method required", { description: "Select how gratuity was received." })
        return
      }
    }

    if (alreadySentReceipt && !receiptDuplicateConfirmed) {
      toast.error("Confirmation needed", {
        description: "A receipt was already sent. Check the box to send again.",
      })
      return
    }

    try {
      await sendReceipt.mutateAsync({
        chefEventId: id!,
        notes: receiptNotes.trim() || undefined,
        tipAmount,
        tipMethod,
      })
      toast.success("Receipt sent", {
        description: "The host will receive the receipt by email.",
      })
      setShowReceiptModal(false)
      resetReceiptModal()
    } catch (e) {
      console.error(e)
      toast.error("Failed to send receipt", {
        description: e instanceof Error ? e.message : "Please try again.",
      })
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">
          Edit Chef Event - {chefEvent.firstName} {chefEvent.lastName}
        </Heading>
        
        {isPending && (
          <div className="flex space-x-2">
            <Button variant="primary" size="small" onClick={() => setShowAcceptModal(true)}>
              Accept Event
            </Button>
            <Button variant="danger" size="small" onClick={() => setShowRejectModal(true)}>
              Reject Event
            </Button>
          </div>
        )}
        
        {isConfirmed && chefEvent.productId && (
          <div className="flex items-center gap-2">
            {canSendReceipt ? (
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  resetReceiptModal()
                  setShowReceiptModal(true)
                }}
              >
                Send Receipt
              </Button>
            ) : null}
            <Button variant="secondary" size="small" asChild>
              <a href={`/products/${chefEvent.productId}`} target="_blank" rel="noreferrer">
                View Product
              </a>
            </Button>
          </div>
        )}
      </div>
      
      <div className="p-6 space-y-6">
        <ChefEventForm 
          key={`${chefEvent.id}-${chefEvent.updatedAt}-${chefEvent.eventMenuId ?? ""}`}
          initialData={chefEvent}
          onSubmit={handleUpdateChefEvent}
          isLoading={updateChefEvent.isPending}
          detailsTabExtra={
            isConfirmed ? (
              <EmailManagementSection 
                chefEvent={chefEvent}
                onEmailSent={() => {
                  toast.success("Email Sent", {
                    description: `Event details sent successfully`,
                    duration: 3000,
                  })
                }}
              />
            ) : null
          }
          menuTabExtra={
            <MenuDetails
              templateProductId={chefEvent.templateProductId}
              eventMenuId={chefEvent.eventMenuId}
              onCustomizeForEvent={handleCustomizeEventMenu}
              onRevertToInitialMenu={() => setShowRevertMenuModal(true)}
              isCustomizingForEvent={deriveChefEventMenu.isPending}
              isRevertingToInitialMenu={revertChefEventMenu.isPending}
            />
          }
        />
      </div>

      {/* Accept Event Modal */}
      {showAcceptModal && (
        <FocusModal open onOpenChange={setShowAcceptModal}>
          <FocusModal.Content>
            <FocusModal.Header>
              <FocusModal.Title>Accept Event</FocusModal.Title>
            </FocusModal.Header>
            <FocusModal.Body>
              <div className="space-y-4">
                <p>This will accept the event and create a product for ticket sales.</p>
                
                {/* Email Notification Control */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="send-acceptance-email"
                    checked={sendAcceptanceEmail}
                    onCheckedChange={(v) => setSendAcceptanceEmail(v === true)}
                  />
                  <Label htmlFor="send-acceptance-email">
                    Send acceptance email to customer
                  </Label>
                </div>
                
                <div>
                  <Label htmlFor="chef-notes">Chef Notes (Optional)</Label>
                  <Textarea
                    id="chef-notes"
                    placeholder="Add any notes about this acceptance..."
                    value={chefNotes}
                    onChange={(e) => setChefNotes(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="secondary" onClick={() => setShowAcceptModal(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="primary"
                    onClick={handleAcceptEvent}
                    disabled={acceptChefEvent.isPending}
                  >
                    {acceptChefEvent.isPending ? "Accepting..." : "Accept Event"}
                  </Button>
                </div>
              </div>
            </FocusModal.Body>
          </FocusModal.Content>
        </FocusModal>
      )}

      {/* Send receipt modal */}
      {showReceiptModal && (
        <FocusModal
          open
          onOpenChange={(open) => {
            setShowReceiptModal(open)
            if (!open) resetReceiptModal()
          }}
        >
          <FocusModal.Content>
            <FocusModal.Header>
              <FocusModal.Title>Send receipt to host</FocusModal.Title>
            </FocusModal.Header>
            <FocusModal.Body>
              <div className="space-y-4">
                <Text size="small" className="text-ui-fg-subtle">
                  Sends a receipt email to the host ({chefEvent.email}). Optional gratuity can be
                  included for their records.
                </Text>
                {alreadySentReceipt ? (
                  <div className="rounded-md border border-ui-border-warning bg-ui-bg-subtle-hover p-3 space-y-2">
                    <Text weight="plus" className="text-ui-fg-base">
                      Receipt already sent
                    </Text>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="receipt-dup-confirm"
                        checked={receiptDuplicateConfirmed}
                        onCheckedChange={(v) =>
                          setReceiptDuplicateConfirmed(v === true)
                        }
                      />
                      <Label htmlFor="receipt-dup-confirm" className="cursor-pointer">
                        I understand and want to send another receipt email
                      </Label>
                    </div>
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="receipt-tip-amount">Gratuity amount (optional)</Label>
                  <Input
                    id="receipt-tip-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={receiptTipAmount}
                    onChange={(e) => setReceiptTipAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="receipt-tip-method">Gratuity method</Label>
                  <select
                    id="receipt-tip-method"
                    className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm"
                    value={receiptTipMethod}
                    onChange={(e) => setReceiptTipMethod(e.target.value)}
                  >
                    <option value="">None</option>
                    <option value="cash">Cash</option>
                    <option value="venmo">Venmo</option>
                    <option value="zelle">Zelle</option>
                    <option value="paypal">PayPal</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {receiptTipMethod === "other" ? (
                  <div>
                    <Label htmlFor="receipt-tip-other">Describe method</Label>
                    <Input
                      id="receipt-tip-other"
                      value={receiptTipMethodOther}
                      onChange={(e) => setReceiptTipMethodOther(e.target.value)}
                      placeholder="e.g. check, Apple Pay"
                    />
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="receipt-notes">Internal notes (optional)</Label>
                  <Textarea
                    id="receipt-notes"
                    value={receiptNotes}
                    onChange={(e) => setReceiptNotes(e.target.value)}
                    placeholder="Shown in email if provided"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowReceiptModal(false)
                      resetReceiptModal()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSendReceipt}
                    disabled={sendReceipt.isPending}
                  >
                    {sendReceipt.isPending ? "Sending…" : "Send receipt"}
                  </Button>
                </div>
              </div>
            </FocusModal.Body>
          </FocusModal.Content>
        </FocusModal>
      )}

      {/* Reject Event Modal */}
      {showRejectModal && (
        <FocusModal open onOpenChange={setShowRejectModal}>
          <FocusModal.Content>
            <FocusModal.Header>
              <FocusModal.Title>Reject Event</FocusModal.Title>
            </FocusModal.Header>
            <FocusModal.Body>
              <div className="space-y-4">
                <p>This will reject the event and send a rejection email to the customer.</p>
                <div>
                  <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Please provide a reason for rejecting this event..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="rejection-notes">Chef Notes (Optional)</Label>
                  <Textarea
                    id="rejection-notes"
                    placeholder="Add any additional notes..."
                    value={chefNotes}
                    onChange={(e) => setChefNotes(e.target.value)}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="secondary" onClick={() => setShowRejectModal(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="danger"
                    onClick={handleRejectEvent}
                    disabled={rejectChefEvent.isPending}
                  >
                    {rejectChefEvent.isPending ? "Rejecting..." : "Reject Event"}
                  </Button>
                </div>
              </div>
            </FocusModal.Body>
          </FocusModal.Content>
        </FocusModal>
      )}

      {/* Revert menu modal */}
      {showRevertMenuModal && (
        <FocusModal
          open
          onOpenChange={(open) => {
            setShowRevertMenuModal(open)
            if (!open) {
              setDeleteDerivedMenuOnRevert(false)
            }
          }}
        >
          <FocusModal.Content>
            <FocusModal.Header>
              <FocusModal.Title>Revert to initially selected menu</FocusModal.Title>
            </FocusModal.Header>
            <FocusModal.Body>
              <div className="space-y-4">
                <p>
                  This will make the initially selected menu the active selected menu for this event again.
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="delete-derived-menu-on-revert"
                    checked={deleteDerivedMenuOnRevert}
                    onCheckedChange={(v) => setDeleteDerivedMenuOnRevert(v === true)}
                  />
                  <Label htmlFor="delete-derived-menu-on-revert">
                    Also delete the derived event menu
                  </Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowRevertMenuModal(false)
                      setDeleteDerivedMenuOnRevert(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleRevertEventMenu}
                    disabled={revertChefEventMenu.isPending}
                  >
                    {revertChefEventMenu.isPending ? "Reverting..." : "Revert Menu"}
                  </Button>
                </div>
              </div>
            </FocusModal.Body>
          </FocusModal.Content>
        </FocusModal>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Chef Event Details",
})

export const handle = {
  breadcrumb: (match: UIMatch<unknown>) => <ChefEventDetailBreadcrumb {...match} />,
}

export default ChefEventDetailPage 