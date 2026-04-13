import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Label, Text, Input } from "@medusajs/ui"
import { useState } from "react"
import { menuSchema } from "../schemas"
import type { AdminCreateMenuDTO, AdminMenuDTO, AdminUpdateMenuDTO } from "../../../../sdk/admin/admin-menus"
import { MenuMedia } from "./menu-media/MenuMedia"
import { MenuPricingTab } from "./menu-pricing-tab"

interface MenuFormProps {
  initialData?: AdminMenuDTO
  onSubmit: (data: AdminCreateMenuDTO) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

type TabType = "general" | "courses" | "media" | "pricing"

//REFACTOR : Use form to handle state and validation not useState

export const MenuForm = ({ initialData, onSubmit, onCancel, isLoading }: MenuFormProps) => {
  const [activeTab, setActiveTab] = useState<TabType>("general")
  const [expandedCourses, setExpandedCourses] = useState<Set<number>>(new Set())
  const [mediaState, setMediaState] = useState<{ images: string[]; image_files: { url: string; file_id?: string }[]; thumbnail?: string | null }>({
    images: initialData?.images?.map((i) => i.url) || [],
    image_files: [],
    thumbnail: initialData?.thumbnail ?? undefined,
  })

  // Transform initialData to match the form structure
  const getDefaultValues = () => {
    if (!initialData) {
      return {
        name: "",
        courses: []
      }
    }
    
    return {
      name: initialData.name,
      courses: initialData.courses?.map(course => ({
        name: course.name,
        dishes: course.dishes?.map(dish => ({
          name: dish.name,
          description: dish.description,
          ingredients: dish.ingredients?.map(ingredient => ({
            name: ingredient.name,
            optional: ingredient.optional
          })) || []
        })) || []
      })) || []
    }
  }

  const form = useForm<AdminCreateMenuDTO>({
    resolver: zodResolver(menuSchema),
    defaultValues: getDefaultValues()
  })

  const { fields: courseFields, append: appendCourse, remove: removeCourse } = useFieldArray({
    control: form.control,
    name: "courses"
  })

  const handleSubmit = async (data: AdminCreateMenuDTO) => {
    try {
      const payload: AdminCreateMenuDTO = {
        ...data,
        images: mediaState.images,
        thumbnail: mediaState.thumbnail,
        image_files: mediaState.image_files,
      }
      await onSubmit(payload)
    } catch (error) {
      console.error("Form submission error:", error)
    }
  }

  const toggleCourseExpansion = (index: number) => {
    const newExpanded = new Set(expandedCourses)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedCourses(newExpanded)
  }

  const addCourse = () => {
    appendCourse({
      name: "",
      dishes: []
    })
    // Expand the newly added course
    setExpandedCourses(prev => new Set([...prev, courseFields.length]))
  }

  const TabButton = ({ tab, label, count }: { tab: TabType; label: string; count?: number }) => (
    <Button
      type="button"
      variant={activeTab === tab ? "primary" : "secondary"}
      onClick={() => setActiveTab(tab)}
    >
      {label}
      {count !== undefined && (
        <span className="ml-2">({count})</span>
      )}
    </Button>
  )

  return (
    <div className="p-6">
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex space-x-2">
          <TabButton tab="general" label="General Info" />
          <TabButton tab="courses" label="Courses" count={courseFields.length} />
          <TabButton tab="media" label="Media" />
          {initialData && <TabButton tab="pricing" label="Pricing" />}
        </div>

        {/* Tab Content */}
        {activeTab === "general" && (
          <GeneralInfoTab 
            form={form} 
            onNextToCourses={() => setActiveTab("courses")} 
            isEditing={!!initialData}
            courseCount={courseFields.length}
          />
        )}

        {activeTab === "courses" && (
          <CoursesTab 
            form={form}
            courseFields={courseFields}
            expandedCourses={expandedCourses}
            toggleCourseExpansion={toggleCourseExpansion}
            addCourse={addCourse}
            removeCourse={removeCourse}
            isEditing={!!initialData}
          />
        )}

        {activeTab === "media" && (
          <MenuMedia
            value={mediaState}
            onChange={setMediaState}
          />
        )}

        {activeTab === "pricing" && initialData && (
          <MenuPricingTab menuId={initialData.id} />
        )}

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : 
             initialData ? "Update Menu" : 
             activeTab === "courses" ? "Create Menu with Courses" : "Create Menu"}
          </Button>
        </div>
      </form>
    </div>
  )
}

// General Info Tab Component
const GeneralInfoTab = ({ form, onNextToCourses, isEditing, courseCount }: { form: any; onNextToCourses: () => void; isEditing: boolean; courseCount: number }) => (
  <div className="space-y-6">
    <div>
      <Label htmlFor="name">Menu Name</Label>
      <Input
        id="name"
        placeholder="Enter menu name..."
        {...form.register("name")}
      />
      {form.formState.errors.name && (
        <Text className="text-red-500 text-sm mt-1">
          {form.formState.errors.name.message}
        </Text>
      )}
    </div>

    {/* Guidance Section - Show when creating new menu or editing menu with no courses */}
    {(!isEditing || (isEditing && courseCount === 0)) && (
      <div className="border rounded-lg p-4 space-y-3">
        <div>
          <Text className="font-medium">
            {isEditing ? "Add Courses to This Menu?" : "What would you like to do next?"}
          </Text>
          <Text className="text-sm text-gray-600 mt-1">
            {isEditing 
              ? "This menu doesn't have any courses yet. You can add courses to organize your dishes, or keep it simple with just the name."
              : "You can create a menu with just a name, or add courses now. Courses can always be added or edited later."
            }
          </Text>
        </div>
        
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onNextToCourses}
            disabled={!form.watch("name")}
          >
            {isEditing ? "Add Courses" : "Next: Add Courses (Optional)"}
          </Button>
          <Text className="text-sm text-gray-500 flex items-center">
            {isEditing 
              ? "or keep the menu as-is"
              : "or use \"Create Menu\" to save with just the name"
            }
          </Text>
        </div>
      </div>
    )}
  </div>
)

// Courses Tab Component
const CoursesTab = ({ 
  form, 
  courseFields, 
  expandedCourses, 
  toggleCourseExpansion, 
  addCourse, 
  removeCourse,
  isEditing
}: {
  form: any
  courseFields: any[]
  expandedCourses: Set<number>
  toggleCourseExpansion: (index: number) => void
  addCourse: () => void
  removeCourse: (index: number) => void
  isEditing: boolean
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <Text className="text-lg font-medium">
          {isEditing ? "Menu Courses" : "Course Management"}
        </Text>
        <Text className="text-sm text-gray-600">
          {isEditing 
            ? "Manage the courses for this menu"
            : "Organize your menu with courses (optional)"
          }
        </Text>
      </div>
      <Button type="button" variant="secondary" onClick={addCourse}>
        + Add Course
      </Button>
    </div>

    {courseFields.length === 0 ? (
      <div className="text-center py-12 space-y-4">
        <div className="space-y-2">
          <Text className="text-lg font-medium">
            {isEditing ? "No Courses Yet" : "Add Courses to Your Menu"}
          </Text>
          <Text className="text-gray-600 max-w-md mx-auto">
            {isEditing 
              ? "This menu doesn't have any courses yet. Courses help organize your menu with multiple dishes and ingredients."
              : "Courses are optional but help organize your menu. Each course can contain multiple dishes with ingredients."
            }
          </Text>
        </div>
        <div className="space-y-3">
          <Button type="button" variant="primary" onClick={addCourse}>
            {isEditing ? "Add First Course" : "Add Your First Course"}
          </Button>
          <Text className="text-sm text-gray-500">
            {isEditing 
              ? "Organize your menu with courses like appetizers, mains, desserts, etc."
              : "You can always add courses later after creating the menu"
            }
          </Text>
        </div>
      </div>
    ) : (
      <div className="space-y-4">
        {courseFields.map((course, courseIndex) => (
          <CourseSection
            key={course.id}
            form={form}
            courseIndex={courseIndex}
            isExpanded={expandedCourses.has(courseIndex)}
            onToggleExpansion={() => toggleCourseExpansion(courseIndex)}
            onRemove={() => removeCourse(courseIndex)}
          />
        ))}
      </div>
    )}
  </div>
)

// Course Section Component
const CourseSection = ({ 
  form, 
  courseIndex, 
  isExpanded, 
  onToggleExpansion, 
  onRemove 
}: {
  form: any
  courseIndex: number
  isExpanded: boolean
  onToggleExpansion: () => void
  onRemove: () => void
}) => {
  const { fields: dishFields, append: appendDish, remove: removeDish } = useFieldArray({
    control: form.control,
    name: `courses.${courseIndex}.dishes`
  })

  const courseName = form.watch(`courses.${courseIndex}.name`) || `Course ${courseIndex + 1}`

  const addDish = () => {
    appendDish({
      name: "",
      description: "",
      ingredients: []
    })
  }

  return (
    <div className="border rounded-lg">
      {/* Course Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3">
          <Button
            type="button"
            variant="transparent"
            onClick={onToggleExpansion}
          >
            {isExpanded ? "▼" : "▶"}
          </Button>
          <Text className="font-medium">
            {courseName} ({dishFields.length} dish{dishFields.length !== 1 ? 'es' : ''})
          </Text>
        </div>
        <Button
          type="button"
          variant="transparent"
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>

      {/* Course Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Course Name */}
          <div>
            <Label>Course Name</Label>
            <Input
              placeholder="Enter course name..."
              {...form.register(`courses.${courseIndex}.name`)}
            />
            {form.formState.errors.courses?.[courseIndex]?.name && (
              <Text className="text-red-500 text-sm mt-1">
                {form.formState.errors.courses[courseIndex].name.message}
              </Text>
            )}
          </div>

          {/* Dishes Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Dishes</Label>
              <Button type="button" variant="secondary" size="small" onClick={addDish}>
                + Add Dish
              </Button>
            </div>

            {dishFields.length === 0 ? (
              <Text size="small" className="text-gray-500 italic">
                No dishes added yet.
              </Text>
            ) : (
              <div className="space-y-3">
                {dishFields.map((dish, dishIndex) => (
                  <DishSection
                    key={dish.id}
                    form={form}
                    courseIndex={courseIndex}
                    dishIndex={dishIndex}
                    onRemove={() => removeDish(dishIndex)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Dish Section Component
const DishSection = ({ 
  form, 
  courseIndex, 
  dishIndex, 
  onRemove 
}: {
  form: any
  courseIndex: number
  dishIndex: number
  onRemove: () => void
}) => {
  const { fields: ingredientFields, append: appendIngredient, remove: removeIngredient } = useFieldArray({
    control: form.control,
    name: `courses.${courseIndex}.dishes.${dishIndex}.ingredients`
  })

  const addIngredient = () => {
    appendIngredient({
      name: "",
      optional: false
    })
  }

  return (
    <div className="border rounded-md p-3">
      <div className="flex items-start justify-between mb-3">
        <Text className="font-medium text-sm">Dish {dishIndex + 1}</Text>
        <Button
          type="button"
          variant="transparent"
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>

      <div className="space-y-4">
        {/* Dish Name */}
        <div>
          <Label>Dish Name</Label>
          <Input
            placeholder="Enter dish name..."
            {...form.register(`courses.${courseIndex}.dishes.${dishIndex}.name`)}
          />
          {form.formState.errors.courses?.[courseIndex]?.dishes?.[dishIndex]?.name && (
            <Text className="text-red-500 text-xs mt-1">
              {form.formState.errors.courses[courseIndex].dishes[dishIndex].name.message}
            </Text>
          )}
        </div>

        {/* Dish Description */}
        <div>
          <Label>Description (Optional)</Label>
          <Input
            placeholder="Enter dish description..."
            {...form.register(`courses.${courseIndex}.dishes.${dishIndex}.description`)}
          />
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label>Ingredients</Label>
            <Button type="button" variant="secondary" size="small" onClick={addIngredient}>
              + Add Ingredient
            </Button>
          </div>

          {ingredientFields.length === 0 ? (
            <Text size="small" className="text-gray-500 italic">
              No ingredients added yet.
            </Text>
          ) : (
            <div className="space-y-2">
              {ingredientFields.map((ingredient, ingredientIndex) => (
                <IngredientRow
                  key={ingredient.id}
                  form={form}
                  courseIndex={courseIndex}
                  dishIndex={dishIndex}
                  ingredientIndex={ingredientIndex}
                  onRemove={() => removeIngredient(ingredientIndex)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Ingredient Row Component
const IngredientRow = ({ 
  form, 
  courseIndex, 
  dishIndex, 
  ingredientIndex, 
  onRemove 
}: {
  form: any
  courseIndex: number
  dishIndex: number
  ingredientIndex: number
  onRemove: () => void
}) => (
  <div className="flex items-start space-x-2">
    <div className="flex-1">
      <Input
        placeholder="Ingredient name..."
        {...form.register(`courses.${courseIndex}.dishes.${dishIndex}.ingredients.${ingredientIndex}.name`)}
      />
      {form.formState.errors.courses?.[courseIndex]?.dishes?.[dishIndex]?.ingredients?.[ingredientIndex]?.name && (
        <Text className="text-red-500 text-xs mt-1">
          {form.formState.errors.courses[courseIndex].dishes[dishIndex].ingredients[ingredientIndex].name.message}
        </Text>
      )}
    </div>
    <div className="flex items-center space-x-1 text-sm whitespace-nowrap mt-2">
      <input
        type="checkbox"
        {...form.register(`courses.${courseIndex}.dishes.${dishIndex}.ingredients.${ingredientIndex}.optional`)}
      />
      <span>Optional</span>
    </div>
    <Button
      type="button"
      variant="transparent"
      onClick={onRemove}
    >
      ✕
    </Button>
  </div>
) 