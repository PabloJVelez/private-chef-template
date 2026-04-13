import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Button,
  Input,
  Label,
  Select,
  Textarea,
  Tabs,
  Switch,
  toast
} from "@medusajs/ui"
import { 
  chefEventSchema, 
  chefEventUpdateSchema,
  eventTypeOptions,
  locationTypeOptions,
  statusOptions,
  getDefaultChefEventValues,
  validateStatusTransition
} from "../schemas"
import { useAdminListMenus } from "../../../hooks/menus"
import { useAdminListExperienceTypes } from "../../../hooks/experience-types"
import type { AdminCreateChefEventDTO, AdminUpdateChefEventDTO } from "../../../../sdk/admin/admin-chef-events"

// Helper function to render error messages
const ErrorMessage = ({ error }: { error: any }) => {
  if (!error) return null
  return <p className="text-red-500 text-sm mt-1">{String(error.message || error)}</p>
}

// Normalize API payloads (camelCase vs snake_case) for react-hook-form
const transformDataForForm = (data: any) => {
  if (!data) return null

  const requestedDate = data.requestedDate ? new Date(data.requestedDate).toISOString().split('T')[0] : ''

  const eventType = String(data.eventType ?? data.event_type ?? "plated_dinner")
  const experience_type_id = String(data.experience_type_id ?? data.experienceTypeId ?? "").trim()

  return {
    ...data,
    requestedDate,
    eventType,
    experience_type_id,
    partySize: Number(data.partySize) || 1,
    estimatedDuration: Number(data.estimatedDuration) || 120,
    totalPrice: Number(data.totalPrice) || 0,
    depositPaid: Boolean(data.depositPaid),
    templateProductId: data.templateProductId ?? data.template_product_id ?? "",
    locationAddress: data.locationAddress ?? data.location_address ?? "",
    firstName: data.firstName ?? data.first_name ?? "",
    lastName: data.lastName ?? data.last_name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    notes: data.notes ?? "",
    specialRequirements: data.specialRequirements ?? data.special_requirements ?? "",
    status: data.status || "pending",
  }
}

interface ChefEventFormProps {
  initialData?: any
  onSubmit: (data: AdminCreateChefEventDTO | AdminUpdateChefEventDTO) => Promise<void>
  isLoading?: boolean
  onCancel?: () => void
}

export const ChefEventForm = ({ 
  initialData, 
  onSubmit, 
  isLoading = false, 
  onCancel 
}: ChefEventFormProps) => {
  const [activeTab, setActiveTab] = useState("general")
  const isEditing = !!initialData
  
  const { data: menusData, isLoading: menusLoading, error: menusError } = useAdminListMenus({ limit: 100 })
  const menus = menusData?.menus || []

  const { data: experienceTypesResponse } = useAdminListExperienceTypes({ limit: 100 })
  const catalogExperiences = experienceTypesResponse?.experience_types ?? []

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(isEditing ? chefEventUpdateSchema : chefEventSchema),
    defaultValues: getDefaultChefEventValues()
  })

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      const formData = transformDataForForm(initialData)
      reset(formData)
    }
  }, [initialData, reset])

  const watchedStatus = watch("status")
  const currentStatus = initialData?.status

  const eventTypeWatched = watch("eventType")
  const experienceTypeIdWatched = watch("experience_type_id") || ""

  const experienceSelectValue = useMemo(() => {
    if (
      experienceTypeIdWatched &&
      catalogExperiences.some((e) => e.id === experienceTypeIdWatched)
    ) {
      return `et:${experienceTypeIdWatched}`
    }
    const wf = eventTypeWatched || "plated_dinner"
    if (eventTypeOptions.some((o) => o.value === wf)) {
      return `wf:${wf}`
    }
    return `wf:plated_dinner`
  }, [experienceTypeIdWatched, eventTypeWatched, catalogExperiences])

  const handleExperienceSelect = (v: string) => {
    if (v.startsWith("et:")) {
      const id = v.slice(3)
      const et = catalogExperiences.find((e) => e.id === id)
      if (et) {
        setValue("experience_type_id", id, { shouldDirty: true, shouldValidate: true })
        setValue("eventType", et.name, { shouldDirty: true, shouldValidate: true })
      }
      return
    }
    if (v.startsWith("wf:")) {
      setValue("experience_type_id", "", { shouldDirty: true, shouldValidate: true })
      setValue("eventType", v.slice(3) as any, { shouldDirty: true, shouldValidate: true })
    }
  }

  const handleFormSubmit = async (data: any) => {
    // Validate status transition if editing
    if (isEditing && currentStatus && data.status !== currentStatus) {
      if (!validateStatusTransition(currentStatus, data.status)) {
        toast.error("Invalid Status Transition", {
          description: `Cannot change status from ${currentStatus} to ${data.status}`,
          duration: 5000,
        })
        return
      }
    }

    try {
      const experienceId = typeof data.experience_type_id === "string" ? data.experience_type_id.trim() : ""
      await onSubmit({
        ...data,
        experience_type_id: experienceId ? experienceId : null,
      })
    } catch (error) {
      console.error("Form submission error:", error)
    }
  }

  const getAvailableStatusOptions = () => {
    if (!isEditing || !currentStatus) return statusOptions
    
    // Allow current status plus valid transitions
    const validTransitions: Record<string, string[]> = {
      pending: ['pending', 'confirmed', 'cancelled'],
      confirmed: ['confirmed', 'completed', 'cancelled'],
      cancelled: ['cancelled'],
      completed: ['completed']
    }
    
    const allowedStatuses = validTransitions[currentStatus] || [currentStatus]
    return statusOptions.filter(option => allowedStatuses.includes(option.value))
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="border-b">
          <Tabs.Trigger value="general">General Info</Tabs.Trigger>
          <Tabs.Trigger value="contact">Contact</Tabs.Trigger>
          <Tabs.Trigger value="location">Location</Tabs.Trigger>
          <Tabs.Trigger value="details">Details</Tabs.Trigger>
        </Tabs.List>

        {/* General Info Tab */}
        <Tabs.Content value="general" className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="requestedDate">Event Date *</Label>
              <Input
                id="requestedDate"
                type="date"
                {...register("requestedDate")}
              />
              {errors.requestedDate && (
                <p className="text-red-500 text-sm mt-1">{String(errors.requestedDate.message)}</p>
              )}
            </div>
            <div>
              <Label htmlFor="requestedTime">Event Time *</Label>
              <Input
                id="requestedTime"
                type="time"
                {...register("requestedTime")}
              />
              {errors.requestedTime && (
                <p className="text-red-500 text-sm mt-1">{String(errors.requestedTime.message)}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="partySize">Party Size *</Label>
              <Input
                id="partySize"
                type="number"
                min="1"
                max="50"
                {...register("partySize", { valueAsNumber: true })}
              />
              {errors.partySize && (
                <p className="text-red-500 text-sm mt-1">{errors.partySize.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="experience-event-type">Experience / Event Type *</Label>
              <Select value={experienceSelectValue} onValueChange={handleExperienceSelect}>
                <Select.Trigger id="experience-event-type">
                  <Select.Value placeholder="Select experience or workflow type" />
                </Select.Trigger>
                <Select.Content>
                  {catalogExperiences.filter((e) => e.is_active !== false).length > 0 && (
                    <>
                      {catalogExperiences
                        .filter((e) => e.is_active !== false)
                        .map((et) => (
                          <Select.Item key={et.id} value={`et:${et.id}`}>
                            {et.name}
                          </Select.Item>
                        ))}
                    </>
                  )}
                  {eventTypeOptions.map((option) => (
                    <Select.Item key={`wf:${option.value}`} value={`wf:${option.value}`}>
                      {option.label} (workflow only)
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              {errors.eventType && (
                <p className="text-red-500 text-sm mt-1">{errors.eventType.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="templateProductId">Menu Template</Label>
              <Select
                value={watch("templateProductId") || undefined}
                onValueChange={(value) => setValue("templateProductId", value === "none" ? "" : value)}
              >
                <Select.Trigger>
                  <Select.Value placeholder={menusLoading ? "Loading menus..." : "Select menu template"} />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="none">No template</Select.Item>
                  {menusLoading ? (
                    <Select.Item value="loading" disabled>Loading menus...</Select.Item>
                  ) : menusError ? (
                    <Select.Item value="error" disabled>Error loading menus</Select.Item>
                  ) : menus.length === 0 ? (
                    <Select.Item value="empty" disabled>No menus available</Select.Item>
                  ) : (
                    menus.map(menu => (
                      <Select.Item key={menu.id} value={menu.id}>
                        {menu.name}
                      </Select.Item>
                    ))
                  )}
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label htmlFor="estimatedDuration">Duration (minutes)</Label>
              <Input
                id="estimatedDuration"
                type="number"
                min="30"
                {...register("estimatedDuration", { valueAsNumber: true })}
              />
              {errors.estimatedDuration && (
                <p className="text-red-500 text-sm mt-1">{errors.estimatedDuration.message}</p>
              )}
            </div>
          </div>
        </Tabs.Content>

        {/* Contact Tab */}
        <Tabs.Content value="contact" className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-red-500 text-sm mt-1">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...register("lastName")}
              />
              {errors.lastName && (
                <p className="text-red-500 text-sm mt-1">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
              )}
            </div>
          </div>
        </Tabs.Content>

        {/* Location Tab */}
        <Tabs.Content value="location" className="space-y-4 pt-6">
          <div>
            <Label htmlFor="locationType">Location Type *</Label>
            <Select
              value={watch("locationType")}
              onValueChange={(value) => setValue("locationType", value as any)}
            >
              <Select.Trigger>
                <Select.Value placeholder="Select location type" />
              </Select.Trigger>
              <Select.Content>
                {locationTypeOptions.map(option => (
                  <Select.Item key={option.value} value={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            {errors.locationType && (
              <p className="text-red-500 text-sm mt-1">{errors.locationType.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="locationAddress">Address *</Label>
            <Textarea
              id="locationAddress"
              {...register("locationAddress")}
              rows={3}
            />
            {errors.locationAddress && (
              <p className="text-red-500 text-sm mt-1">{errors.locationAddress.message}</p>
            )}
          </div>
        </Tabs.Content>

        {/* Details Tab */}
        <Tabs.Content value="details" className="space-y-4 pt-6">
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={3}
            />
            {errors.notes && (
              <p className="text-red-500 text-sm mt-1">{errors.notes.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="specialRequirements">Special Requirements</Label>
            <Textarea
              id="specialRequirements"
              {...register("specialRequirements")}
              rows={3}
            />
            {errors.specialRequirements && (
              <p className="text-red-500 text-sm mt-1">{errors.specialRequirements.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="totalPrice">Total Price ($)</Label>
              <Input
                id="totalPrice"
                type="number"
                min="0"
                step="0.01"
                {...register("totalPrice", { valueAsNumber: true })}
              />
              {errors.totalPrice && (
                <p className="text-red-500 text-sm mt-1">{errors.totalPrice.message}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="depositPaid"
                checked={watch("depositPaid")}
                onCheckedChange={(checked) => setValue("depositPaid", checked)}
              />
              <Label htmlFor="depositPaid">Deposit Paid</Label>
            </div>
          </div>

          {isEditing && (
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={watchedStatus}
                onValueChange={(value) => setValue("status", value as any)}
              >
                <Select.Trigger>
                  <Select.Value placeholder="Select status" />
                </Select.Trigger>
                <Select.Content>
                  {getAvailableStatusOptions().map(option => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              {errors.status && (
                <p className="text-red-500 text-sm mt-1">{errors.status.message}</p>
              )}
            </div>
          )}
        </Tabs.Content>
      </Tabs>

      {/* Form Actions */}
      <div className="flex justify-end space-x-2 pt-6 border-t">
        {onCancel && (
          <Button 
            type="button" 
            variant="secondary" 
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
        <Button 
          type="submit" 
          isLoading={isLoading}
          disabled={isLoading}
        >
          {isEditing ? "Update Event" : "Create Event"}
        </Button>
      </div>
    </form>
  )
} 