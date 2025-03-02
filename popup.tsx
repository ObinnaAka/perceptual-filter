import { Plus, Settings, X } from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"

import { Storage } from "@plasmohq/storage"

import { Button } from "./components/ui/button"
import { Input } from "./components/ui/input"
import { Logo } from "./components/ui/logo"
import { Switch } from "./components/ui/switch"
import { useDebounce } from "./hooks/useDebounce"

import "./style.css"

const storage = new Storage()

// Add a helper function to ensure storage works
async function ensureStorage() {
  try {
    // Try accessing the storage directly
    const testKey = "storage-test-init"

    // Try with the @plasmohq/storage implementation
    await storage.set(testKey, { test: true, timestamp: Date.now() })
    const testGet = await storage.get(testKey)
    console.log("[Storage] Test completed successfully")
    await storage.remove(testKey)

    // Also try with direct localStorage
    try {
      localStorage.setItem("feed-ly-local-test", JSON.stringify({ test: true }))
      localStorage.removeItem("feed-ly-local-test")
    } catch (e) {
      console.error("[Storage] Direct localStorage test failed:", e)
    }

    return true
  } catch (e) {
    console.error("[Storage] Test failed:", e)
    return false
  }
}

type CategoryType = "include" | "exclude"

interface CategoryState {
  include: string[]
  exclude: string[]
}

// Add a new interface for Sets-based category management
interface CategoryStateSet {
  include: Set<string>
  exclude: Set<string>
}

interface CategoryInputState {
  value: string
  isAdding: boolean
}

interface CategoryListProps {
  type: CategoryType
  title: string
  description: string
  categories: string[]
  inputState: string
  onInputChange: (value: string) => void
  onAdd: (value: string) => void
  onRemove: (category: string) => void
}

const CategoryList = memo(
  ({
    type,
    title,
    description,
    categories,
    inputState,
    onInputChange,
    onAdd,
    onRemove
  }: CategoryListProps) => {
    // Simplified logging focused on the actual categories
    if (categories?.length) {
      console.log(`[UI] ${type} categories:`, categories)
    }

    // Ensure categories is always an array
    const safeCategories = Array.isArray(categories) ? categories : []

    return (
      <div className="space-y-3">
        <div>
          <span className="text-sm font-medium text-foreground">{title}</span>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        {/* Text input with enter to add */}
        <div className="flex gap-2">
          <Input
            value={inputState}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputState.trim()) {
                onAdd(inputState.trim())
              }
            }}
            placeholder="Type and press Enter to add..."
            className="flex-1"
          />
        </div>

        {/* Tags display */}
        <div className="flex flex-wrap gap-2">
          {safeCategories.length === 0 && (
            <div className="text-sm text-gray-400 italic">
              No categories added
            </div>
          )}
          {safeCategories.map((category) => (
            <div
              key={category}
              className="group flex items-center gap-1 bg-muted rounded-full px-3 py-1 text-sm">
              {category}
              <button
                onClick={() => onRemove(category)}
                className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }
)

CategoryList.displayName = "CategoryList"

function IndexPopup() {
  const [enabled, setEnabled] = useState(false)
  const [categories, setCategories] = useState<CategoryStateSet>({
    include: new Set<string>(),
    exclude: new Set<string>()
  })
  const [inputStates, setInputStates] = useState({
    include: "",
    exclude: ""
  })
  const [apiKeyStatus, setApiKeyStatus] = useState<"set" | "not-set">("not-set")
  const [isLoading, setIsLoading] = useState(true)
  const [debugStatus, setDebugStatus] = useState<string | null>(null)
  const [renderKey, setRenderKey] = useState(0)
  // Add a flag to track if categories have been modified by user actions
  const [categoriesDirty, setCategoriesDirty] = useState(false)
  // Add a flag to track if enabled state has been modified by user actions
  const [enabledDirty, setEnabledDirty] = useState(false)

  // Extract loadState function from useEffect to make it reusable
  const loadState = async () => {
    console.log("===== LOADING STATE =====")
    setIsLoading(true)
    // Reset the dirty flags when loading from storage
    setCategoriesDirty(false)
    setEnabledDirty(false)
    try {
      // Test storage functionality first
      const storageWorks = await ensureStorage()
      console.log(
        "[Storage] Functionality check:",
        storageWorks ? "OK" : "FAILED"
      )

      // Ensure storage is properly initialized
      await storage.set("storage-initialized", true)

      // Try to direct load categories from localStorage first as a backup method
      let loadedFromDirect = false
      try {
        const directCategories = localStorage.getItem("user-categories")
        if (directCategories) {
          console.log(
            "[Storage] Found direct localStorage entry for categories"
          )
          try {
            const parsed = JSON.parse(directCategories)
            if (parsed && parsed.include && parsed.exclude) {
              console.log(
                "[Storage] Using direct localStorage categories:",
                parsed
              )
              setCategories({
                include: new Set(parsed.include),
                exclude: new Set(parsed.exclude)
              })
              loadedFromDirect = true
            }
          } catch (e) {
            console.error(
              "[Storage] Failed to parse direct localStorage categories:",
              e
            )
          }
        }
      } catch (directError) {
        console.error(
          "[Storage] Error checking direct localStorage:",
          directError
        )
      }

      // If we couldn't load directly, proceed with normal loading
      if (!loadedFromDirect) {
        // Load enabled state
        const enabled = await storage.get<boolean>("enabled")
        setEnabled(enabled ?? true) // Default to true if not set

        // Load API key status
        const apiKey = await storage.get("openai-api-key")
        setApiKeyStatus(apiKey && apiKey !== "" ? "set" : "not-set")

        // Load categories with extra verification
        try {
          const savedCategories =
            await storage.get<CategoryState>("user-categories")
          console.log("[Storage] Raw categories from storage:", savedCategories)

          // Check if we have a valid object with arrays
          const validInclude =
            savedCategories && Array.isArray(savedCategories.include)
          const validExclude =
            savedCategories && Array.isArray(savedCategories.exclude)

          if (validInclude && validExclude) {
            console.log("[Storage] Valid categories found")

            // Initialize with explicit new Sets
            const loadedCategories = {
              include: new Set(savedCategories.include),
              exclude: new Set(savedCategories.exclude)
            }

            console.log("[State] Setting categories:", loadedCategories)
            setCategories(loadedCategories)

            // Force UI update by updating render key
            setRenderKey((prev) => prev + 1)
          } else {
            console.log(
              "[Storage] Invalid or missing categories, initializing with defaults"
            )

            // Initialize with empty Sets and save to storage
            const defaultCategories = {
              include: new Set<string>(),
              exclude: new Set<string>()
            }
            setCategories(defaultCategories)

            // Ensure storage has the default value (convert Sets to arrays for storage)
            await storage.set("user-categories", {
              include: [],
              exclude: []
            })
          }
        } catch (categoryError) {
          console.error("[Storage] Error processing categories:", categoryError)

          // Fall back to defaults
          const defaultCategories = {
            include: new Set<string>(),
            exclude: new Set<string>()
          }
          setCategories(defaultCategories)

          // Try to save defaults
          try {
            await storage.set("user-categories", {
              include: [],
              exclude: []
            })
          } catch (saveError) {
            console.error(
              "[Storage] Failed to save default categories:",
              saveError
            )
          }
        }
      } else {
        // We successfully loaded from direct localStorage
        // Still load other non-category state
        try {
          const enabled = await storage.get<boolean>("enabled")
          setEnabled(enabled ?? true)

          const apiKey = await storage.get("openai-api-key")
          setApiKeyStatus(apiKey && apiKey !== "" ? "set" : "not-set")
        } catch (e) {
          console.error("Error loading additional state:", e)
        }
      }
    } catch (error) {
      console.error("[Storage] Error loading state:", error)
      // Use defaults if loading fails
      setEnabled(true)
      setCategories({ include: new Set<string>(), exclude: new Set<string>() })
    } finally {
      setIsLoading(false)
      console.log("===== STATE LOADING COMPLETE =====")
    }
  }

  // Update the useEffect to use the extracted loadState function
  useEffect(() => {
    loadState()
  }, [])

  // Save enabled state when it changes
  useEffect(() => {
    const saveEnabledState = async () => {
      // Only save if enabled state has been modified by user actions
      if (!enabledDirty) {
        console.log(
          "[Storage] Skipping enabled state save - not modified by user"
        )
        return
      }

      try {
        await storage.set("enabled", enabled)
        console.log("[State] Enabled state saved:", enabled)
      } catch (error) {
        console.error("[Storage] Error saving enabled state:", error)
      }
    }
    saveEnabledState()
  }, [enabled, enabledDirty])

  // Update the useEffect for saving categories
  useEffect(() => {
    if (categoriesDirty) {
      const saveCategories = async () => {
        try {
          console.log("[Storage] Saving categories due to changes:", {
            include: categories.include.size,
            exclude: categories.exclude.size
          })

          // Convert Sets to arrays for storage
          const categoriesToSave = {
            include: Array.from(categories.include),
            exclude: Array.from(categories.exclude)
          }

          // Use JSON.parse/stringify to ensure we're storing a clean object
          await storage.set(
            "user-categories",
            JSON.parse(JSON.stringify(categoriesToSave))
          )

          // Force a reload of the content script to ensure it picks up the new categories
          await storage.set("categories-updated", Date.now())

          // Verify what was saved by reading it back
          const savedCategories =
            await storage.get<CategoryState>("user-categories")
          if (savedCategories) {
            console.log("[Storage] Categories saved successfully:", {
              include: savedCategories.include?.length || 0,
              exclude: savedCategories.exclude?.length || 0
            })
          } else {
            console.error("[Storage] Failed to verify saved categories")
          }
        } catch (error) {
          console.error("[Storage] Error saving categories:", error)
        }
      }
      saveCategories()
    }
  }, [categories, categoriesDirty])

  // Debug test storage with cleaner logging
  const debugTestStorage = async () => {
    try {
      console.log("===== STORAGE DEBUG TEST =====")

      // Examine the storage object
      console.log("[Storage] Area:", storage.area)

      // Check current categories state
      console.log("[State] Current categories:", {
        include: categories.include.size,
        exclude: categories.exclude.size
      })

      // Try to get the current categories from storage directly
      const currentStorage = await storage.get<CategoryState>("user-categories")
      console.log(
        "[Storage] Direct access to categories:",
        currentStorage
          ? {
              include: currentStorage.include?.length || 0,
              exclude: currentStorage.exclude?.length || 0
            }
          : "None"
      )

      // Force save to storage with clean object
      const cleanCategories = {
        include: Array.from(categories.include),
        exclude: Array.from(categories.exclude)
      }

      console.log("[Storage] Forcing clean save of categories")

      // Use JSON to ensure clean object
      await storage.set(
        "user-categories",
        JSON.parse(JSON.stringify(cleanCategories))
      )

      // Read back and verify
      const savedCategories =
        await storage.get<CategoryState>("user-categories")

      if (savedCategories) {
        console.log("[Storage] Categories after forced save:", {
          include: savedCategories.include?.length || 0,
          exclude: savedCategories.exclude?.length || 0
        })
      }

      // Final verification
      const success = Boolean(
        savedCategories &&
          Array.isArray(savedCategories.include) &&
          Array.isArray(savedCategories.exclude)
      )

      console.log("[Storage] Test result:", success ? "SUCCESS" : "FAILED")
      console.log("===== STORAGE TEST COMPLETE =====")

      return {
        success,
        savedCategories,
        detail: {
          storageArea: storage.area,
          categoriesInState: {
            include: categories.include.size,
            exclude: categories.exclude.size
          },
          categoriesInStorage: savedCategories
            ? {
                include: savedCategories.include?.length || 0,
                exclude: savedCategories.exclude?.length || 0
              }
            : null
        }
      }
    } catch (error) {
      console.error("[Storage] Error in storage test:", error)
      return { success: false, error }
    }
  }

  const runStorageTest = async () => {
    setDebugStatus("Testing storage...")
    try {
      const result = (await debugTestStorage()) as {
        success: boolean
        savedCategories?: CategoryState
        detail?: {
          storageArea: string
          categoriesInState: any
          categoriesInStorage: any
        }
        error?: any
      }

      if (result.success) {
        setDebugStatus("Storage working ✓")
        console.log("[Storage] Test details:", result.detail)
        setTimeout(() => setDebugStatus(null), 3000)
      } else {
        setDebugStatus("Storage error!")
        console.error("[Storage] Test failed:", result)
        setTimeout(() => setDebugStatus(null), 3000)
      }
    } catch (e) {
      setDebugStatus("Test failed!")
      console.error("[Storage] Exception during test:", e)
      setTimeout(() => setDebugStatus(null), 3000)
    }
  }

  const handleInputChange = (type: CategoryType, value: string) => {
    setInputStates((prev) => ({
      ...prev,
      [type]: value
    }))
  }

  // A direct function to save categories to storage
  const saveCategoryToStorage = async (newCategories: CategoryStateSet) => {
    try {
      console.log("[Storage] Direct save initiated for categories")

      // Convert Sets to arrays for storage
      const storageFormat = {
        include: Array.from(newCategories.include),
        exclude: Array.from(newCategories.exclude)
      }

      console.log("[Storage] Preparing categories for storage:", storageFormat)

      // Force a clean object to avoid any reference issues
      await storage.set(
        "user-categories",
        JSON.parse(JSON.stringify(storageFormat))
      )

      // Verify storage
      const savedData = await storage.get<CategoryState>("user-categories")
      if (savedData) {
        console.log("[Storage] Direct save completed successfully:", {
          include: savedData.include.length,
          exclude: savedData.exclude.length
        })

        // Force a reload of the content script to ensure it picks up the new categories
        await storage.set("categories-updated", Date.now())
      } else {
        console.error("[Storage] Direct save completed but verification failed")
      }
    } catch (error) {
      console.error("[Storage] Error during direct save:", error)
    }
  }

  const addCategory = (type: CategoryType, value: string) => {
    if (!value.trim()) return

    const capitalizedValue = value.trim().toUpperCase()
    console.log(`[Action] Adding ${capitalizedValue} to ${type} categories`)

    // Create new Sets based on the current ones
    const newInclude = new Set(categories.include)
    const newExclude = new Set(categories.exclude)

    if (type === "include") {
      newInclude.add(capitalizedValue)
    } else if (type === "exclude") {
      newExclude.add(capitalizedValue)
    }

    // Set the new state with the updated Sets
    const newCategories = {
      include: newInclude,
      exclude: newExclude
    }

    console.log(`[State] Updated categories:`, {
      include: newInclude.size,
      exclude: newExclude.size
    })

    // Mark categories as dirty (modified by user)
    setCategoriesDirty(true)

    // First update local state
    setCategories(newCategories)

    // Then explicitly save to storage directly
    saveCategoryToStorage(newCategories)

    setInputStates((prev) => ({
      ...prev,
      [type]: ""
    }))
  }

  const removeCategory = (type: CategoryType, category: string) => {
    console.log(`[Action] Removing ${category} from ${type} categories`)

    // Create new Sets based on the current ones
    const newInclude = new Set(categories.include)
    const newExclude = new Set(categories.exclude)

    if (type === "include") {
      newInclude.delete(category)
    } else if (type === "exclude") {
      newExclude.delete(category)
    }

    // Set the new state with the updated Sets
    const newCategories = {
      include: newInclude,
      exclude: newExclude
    }

    console.log(`[State] Updated categories after removal:`, {
      include: newInclude.size,
      exclude: newExclude.size
    })

    // Mark categories as dirty (modified by user)
    setCategoriesDirty(true)

    // First update local state
    setCategories(newCategories)

    // Then explicitly save to storage directly
    saveCategoryToStorage(newCategories)
  }

  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  // Add a reset categories function
  const resetCategories = async () => {
    console.log("[Action] Resetting categories to defaults")
    try {
      const defaultCategoriesSet = {
        include: new Set<string>(),
        exclude: new Set<string>()
      }

      // Default empty arrays for storage
      const defaultCategories = {
        include: [],
        exclude: []
      }

      // Mark categories as dirty (modified by user)
      setCategoriesDirty(true)

      // Update state
      setCategories(defaultCategoriesSet)

      // Save to storage directly
      await storage.set("user-categories", defaultCategories)
      console.log("[Storage] Categories reset to defaults")

      // Force UI refresh
      setRenderKey((prev) => prev + 1)
    } catch (error) {
      console.error("[Storage] Failed to reset categories:", error)
    }
  }

  // Add a function to completely clear storage for troubleshooting
  const clearAllStorage = async () => {
    console.log("[Action] Clearing all storage")
    try {
      setDebugStatus("Clearing storage...")

      // Clear the main categories
      await storage.set("user-categories", { include: [], exclude: [] })

      // Try to clear localStorage directly
      try {
        localStorage.clear()
        console.log("[Storage] Direct localStorage cleared")
      } catch (e) {
        console.error("[Storage] Failed to clear localStorage directly:", e)
      }

      // Clear initialization flag
      await storage.remove("storage-initialized")

      console.log("[Storage] All storage cleared")
      setDebugStatus("Storage cleared ✓")

      // Reset state
      setCategories({ include: new Set<string>(), exclude: new Set<string>() })

      // Force UI refresh
      setRenderKey((prev) => prev + 1)

      // Refresh with delay
      setTimeout(() => setDebugStatus(null), 3000)

      // Reload categories
      await loadState()
    } catch (e) {
      console.error("[Storage] Failed to clear storage:", e)
      setDebugStatus("Clear failed!")
      setTimeout(() => setDebugStatus(null), 3000)
    }
  }

  // Add a function to force reload both state and UI
  const forceReload = async () => {
    console.log("[Action] Force reload triggered")
    setDebugStatus("Reloading...")

    try {
      // Reload state from storage
      await loadState()

      // Force UI refresh
      setRenderKey((prev) => prev + 1)

      console.log("[UI] Render key updated to force refresh:", renderKey + 1)
      setDebugStatus("Reloaded ✓")
      setTimeout(() => setDebugStatus(null), 3000)
    } catch (e) {
      console.error("[Action] Failed to reload:", e)
      setDebugStatus("Reload failed!")
      setTimeout(() => setDebugStatus(null), 3000)
    }
  }

  return (
    <div className="w-80 bg-background" key={renderKey}>
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center space-x-3">
          <Logo />
          <h1 className="text-xl font-bold text-foreground">Feed.ly</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">
                Loading settings...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Enable/Disable Switch */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-foreground">
                  Enable
                </span>
                <p className="text-xs text-muted-foreground">
                  Turn post filtering on/off
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(newValue) => {
                  // Mark enabled as dirty (modified by user)
                  setEnabledDirty(true)
                  setEnabled(newValue)
                }}
              />
            </div>

            {/* Category Lists */}
            <CategoryList
              type="include"
              title="Include Categories"
              description="Show posts matching these categories"
              categories={Array.from(categories.include)}
              inputState={inputStates.include}
              onInputChange={(value) => handleInputChange("include", value)}
              onAdd={(value) => addCategory("include", value)}
              onRemove={(category) => removeCategory("include", category)}
            />

            <CategoryList
              type="exclude"
              title="Exclude Categories"
              description="Hide posts matching these categories"
              categories={Array.from(categories.exclude)}
              inputState={inputStates.exclude}
              onInputChange={(value) => handleInputChange("exclude", value)}
              onAdd={(value) => addCategory("exclude", value)}
              onRemove={(category) => removeCategory("exclude", category)}
            />

            {/* Debug Panel for Categories */}
            <div className="p-3 bg-gray-100 rounded-md text-xs">
              <h4 className="font-medium mb-2">Categories Debug View:</h4>
              <div>
                <span className="font-medium">Include:</span>
                {categories.include && categories.include.size > 0
                  ? Array.from(categories.include).join(", ")
                  : "(none)"}
              </div>
              <div>
                <span className="font-medium">Exclude:</span>
                {categories.exclude && categories.exclude.size > 0
                  ? Array.from(categories.exclude).join(", ")
                  : "(none)"}
              </div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="font-medium">Status:</span> Categories{" "}
                  {categories.include && categories.exclude
                    ? "loaded"
                    : "missing"}
                </div>
                <div>
                  <span className="font-medium">Storage area:</span>{" "}
                  {storage.area}
                </div>
                <div>
                  <span className="font-medium">Render key:</span> {renderKey}
                </div>
              </div>
            </div>

            {/* API Key Status */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-foreground">
                  API Key
                </span>
                <p className="text-xs text-muted-foreground">
                  OpenAI API configuration
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  apiKeyStatus === "set"
                    ? "bg-green-100 text-green-800"
                    : "bg-destructive/10 text-destructive"
                }`}>
                {apiKeyStatus === "set" ? "Configured" : "Not Set"}
              </span>
            </div>

            {/* At the bottom, add a reset categories button */}
            <div className="pt-2 mt-4 border-t">
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between items-center">
                  <button
                    onClick={resetCategories}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                    Reset Categories
                  </button>

                  <div className="flex items-center">
                    {debugStatus && (
                      <span className="text-xs mr-2 text-muted-foreground">
                        {debugStatus}
                      </span>
                    )}
                    <button
                      onClick={runStorageTest}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      Test Storage
                    </button>
                  </div>
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={forceReload}
                    className="text-xs text-muted-foreground hover:text-blue-500 transition-colors">
                    Force Reload UI
                  </button>

                  <button
                    onClick={clearAllStorage}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                    Clear All Storage
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-muted/50 border-t">
        <Button
          onClick={openOptions}
          className="w-full"
          variant="default"
          disabled={isLoading}>
          <Settings className="w-4 h-4 mr-2" />
          Open Settings
        </Button>
      </div>
    </div>
  )
}

export default IndexPopup
