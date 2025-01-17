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

type CategoryType = "include" | "exclude"

interface CategoryState {
  include: string[]
  exclude: string[]
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
  inputState: CategoryInputState
  inputRef: React.RefObject<HTMLInputElement>
  onStartAdding: () => void
  onInputChange: (value: string) => void
  onAdd: () => void
  onRemove: (category: string) => void
  onCancel: () => void
}

const CategoryList = memo(
  ({
    type,
    title,
    description,
    categories,
    inputState,
    inputRef,
    onStartAdding,
    onInputChange,
    onAdd,
    onRemove,
    onCancel
  }: CategoryListProps) => {
    const [localValue, setLocalValue] = useState("")
    const debouncedValue = useDebounce(localValue, 100)

    useEffect(() => {
      onInputChange(debouncedValue)
    }, [debouncedValue, onInputChange])

    useEffect(() => {
      if (!inputState.isAdding) {
        setLocalValue("")
      }
    }, [inputState.isAdding])

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">{title}</span>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onStartAdding}
            className="h-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Category Items */}
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category}
              className="flex items-center justify-between bg-muted/50 px-3 py-1.5 rounded-md">
              <span className="text-sm">{category}</span>
              <button
                onClick={() => onRemove(category)}
                className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Category Form */}
        {inputState.isAdding && (
          <div className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              placeholder="Enter category name"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAdd()
                  setLocalValue("")
                } else if (e.key === "Escape") {
                  onCancel()
                  setLocalValue("")
                }
              }}
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onAdd()
                setLocalValue("")
              }}
              className="h-8">
              Add
            </Button>
          </div>
        )}
      </div>
    )
  }
)

CategoryList.displayName = "CategoryList"

function IndexPopup() {
  const [isEnabled, setIsEnabled] = useState(true)
  const [apiKeyStatus, setApiKeyStatus] = useState<"set" | "not-set">("not-set")
  const [categories, setCategories] = useState<CategoryState>({
    include: [],
    exclude: []
  })
  const [inputStates, setInputStates] = useState<
    Record<CategoryType, CategoryInputState>
  >({
    include: { value: "", isAdding: false },
    exclude: { value: "", isAdding: false }
  })
  const inputRefs = {
    include: useRef<HTMLInputElement>(null),
    exclude: useRef<HTMLInputElement>(null)
  }

  useEffect(() => {
    // Load initial state
    const loadState = async () => {
      const enabled = await storage.get<boolean>("filter-enabled")
      setIsEnabled(enabled ?? true) // Default to true if not set

      const apiKey = await storage.get("openai-api-key")
      setApiKeyStatus(apiKey ? "set" : "not-set")

      const savedCategories =
        await storage.get<CategoryState>("user-categories")
      setCategories(savedCategories || { include: [], exclude: [] })
    }
    loadState()
  }, [])

  const handleToggle = async (checked: boolean) => {
    setIsEnabled(checked)
    await storage.set("filter-enabled", checked)
  }

  const openOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  const startAddingCategory = (type: CategoryType) => {
    setInputStates((prev) => ({
      ...prev,
      [type]: { ...prev[type], isAdding: true }
    }))
    // Focus the input after state update
    setTimeout(() => {
      inputRefs[type].current?.focus()
    }, 0)
  }

  const handleInputChange = (type: CategoryType, value: string) => {
    setInputStates((prev) => ({
      ...prev,
      [type]: { ...prev[type], value }
    }))
  }

  const addCategory = async (type: CategoryType) => {
    const value = inputStates[type].value.trim()
    if (value) {
      const updatedCategories = {
        ...categories,
        [type]: [...categories[type], value]
      }
      setCategories(updatedCategories)
      await storage.set("user-categories", updatedCategories)
      setInputStates((prev) => ({
        ...prev,
        [type]: { value: "", isAdding: false }
      }))
    }
  }

  const removeCategory = async (type: CategoryType, category: string) => {
    const updatedCategories = {
      ...categories,
      [type]: categories[type].filter((c) => c !== category)
    }
    setCategories(updatedCategories)
    await storage.set("user-categories", updatedCategories)
  }

  const cancelAdding = (type: CategoryType) => {
    setInputStates((prev) => ({
      ...prev,
      [type]: { value: "", isAdding: false }
    }))
  }

  return (
    <div className="w-80 bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center space-x-3">
          <Logo />
          <h1 className="text-xl font-bold text-foreground">FilterIn</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Filter Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">
              Filter Status
            </span>
            <p className="text-xs text-muted-foreground">
              {isEnabled ? "Actively filtering posts" : "Filter disabled"}
            </p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        </div>

        {/* Categories */}
        <CategoryList
          type="include"
          title="Include Categories"
          description="Show posts matching these categories"
          categories={categories.include}
          inputState={inputStates.include}
          inputRef={inputRefs.include}
          onStartAdding={() => startAddingCategory("include")}
          onInputChange={(value) => handleInputChange("include", value)}
          onAdd={() => addCategory("include")}
          onRemove={(category) => removeCategory("include", category)}
          onCancel={() => cancelAdding("include")}
        />
        <CategoryList
          type="exclude"
          title="Exclude Categories"
          description="Hide posts matching these categories"
          categories={categories.exclude}
          inputState={inputStates.exclude}
          inputRef={inputRefs.exclude}
          onStartAdding={() => startAddingCategory("exclude")}
          onInputChange={(value) => handleInputChange("exclude", value)}
          onAdd={() => addCategory("exclude")}
          onRemove={(category) => removeCategory("exclude", category)}
          onCancel={() => cancelAdding("exclude")}
        />

        {/* API Key Status */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">API Key</span>
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
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-muted/50 border-t">
        <Button onClick={openOptions} className="w-full" variant="default">
          <Settings className="w-4 h-4 mr-2" />
          Open Settings
        </Button>
      </div>
    </div>
  )
}

export default IndexPopup
