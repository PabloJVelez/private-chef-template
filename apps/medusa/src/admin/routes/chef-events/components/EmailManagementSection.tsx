import { useState } from "react"
import { Container, Button, Label, Input, Textarea, Badge, FocusModal, toast } from "@medusajs/ui"
import { useAdminResendEventEmailMutation } from "../../../hooks/chef-events"

interface EmailManagementSectionProps {
  chefEvent: any
  onEmailSent: (emailData: any) => void
}

export const EmailManagementSection = ({ chefEvent, onEmailSent }: EmailManagementSectionProps) => {
  const [showResendModal, setShowResendModal] = useState(false)
  const [customEmails, setCustomEmails] = useState("")
  const [emailNotes, setEmailNotes] = useState("")
  const [emailType, setEmailType] = useState<"host" | "custom">("host")
  
  const resendEmail = useAdminResendEventEmailMutation()

  const handleResendEmail = async () => {
    try {
      const recipients = emailType === "host" 
        ? [chefEvent.email]
        : customEmails.split(",").map(email => email.trim()).filter(Boolean)
      
      await resendEmail.mutateAsync({
        chefEventId: chefEvent.id,
        recipients,
        notes: emailNotes,
        emailType: "event_details_resend"
      })
      
      toast.success("Email Sent", {
        description: `Event details sent to ${recipients.length} recipient(s)`,
        duration: 3000,
      })
      
      setShowResendModal(false)
      setCustomEmails("")
      setEmailNotes("")
      onEmailSent({ recipients, sentAt: new Date() })
      
    } catch (error) {
      toast.error("Email Failed", {
        description: "Failed to send email. Please try again.",
        duration: 5000,
      })
    }
  }

  return (
    <Container className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Email Management</h3>
          <Button 
            variant="secondary" 
            size="small"
            onClick={() => setShowResendModal(true)}
          >
            Resend Event Details
          </Button>
        </div>
        
        {/* Email History */}
        {chefEvent.emailHistory && chefEvent.emailHistory.length > 0 && (
          <div>
            <Label>Recent Email Activity</Label>
            <div className="mt-2 space-y-2">
              {chefEvent.emailHistory.slice(-3).map((email: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <span className="text-sm font-medium">{email.type}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      to {email.recipients.join(", ")}
                    </span>
                  </div>
                  <Badge color="grey">
                    {new Date(email.sentAt).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Resend Modal */}
        {showResendModal && (
          <FocusModal open onOpenChange={setShowResendModal}>
            <FocusModal.Content>
              <FocusModal.Header>
                <FocusModal.Title>Resend Event Details</FocusModal.Title>
              </FocusModal.Header>
              <FocusModal.Body>
                <div className="space-y-4">
                  <p>Send event details and confirmation to recipients.</p>
                  
                  {/* Recipient Selection */}
                  <div>
                    <Label>Send to</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="host-email"
                          name="email-type"
                          checked={emailType === "host"}
                          onChange={() => setEmailType("host")}
                        />
                        <Label htmlFor="host-email">
                          Host ({chefEvent.email})
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="custom-emails"
                          name="email-type"
                          checked={emailType === "custom"}
                          onChange={() => setEmailType("custom")}
                        />
                        <Label htmlFor="custom-emails">
                          Custom email addresses
                        </Label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Custom Email Input */}
                  {emailType === "custom" && (
                    <div>
                      <Label htmlFor="custom-email-list">Email Addresses</Label>
                      <Input
                        id="custom-email-list"
                        placeholder="email1@example.com, email2@example.com"
                        value={customEmails}
                        onChange={(e) => setCustomEmails(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Separate multiple emails with commas
                      </p>
                    </div>
                  )}
                  
                  {/* Additional Notes */}
                  <div>
                    <Label htmlFor="email-notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="email-notes"
                      placeholder="Add any additional notes for this email..."
                      value={emailNotes}
                      onChange={(e) => setEmailNotes(e.target.value)}
                    />
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={() => setShowResendModal(false)}>
                      Cancel
                    </Button>
                    <Button 
                      variant="primary"
                      onClick={handleResendEmail}
                      disabled={resendEmail.isPending || (emailType === "custom" && !customEmails.trim())}
                    >
                      {resendEmail.isPending ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </div>
              </FocusModal.Body>
            </FocusModal.Content>
          </FocusModal>
        )}
      </div>
    </Container>
  )
}