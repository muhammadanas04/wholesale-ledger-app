import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'

export default function CategorySelect({
  value,
  onChange,
  categories = [],
  placeholder = 'Choose category...',
  className = '',
  required = false,
  disabled = false,
  onCreateCategory
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)

  const selectedCategory = categories.find(c => String(c.id) === String(value))
  const [searchText, setSearchText] = useState(selectedCategory ? selectedCategory.name : '')

  useEffect(() => {
    const cat = categories.find(c => String(c.id) === String(value))
    if (cat) {
      setSearchText(cat.name)
    } else if (!value) {
      setSearchText('')
    }
  }, [value, categories])

  // Filter categories based on search text
  const filteredCategories = categories.filter((c) => {
    if (!c || !c.name) return false
    if (selectedCategory && searchText === selectedCategory.name) return true
    if (!searchText) return true
    return c.name.toLowerCase().includes(searchText.toLowerCase())
  })

  // Check if we need to show the "Create" option
  const exactMatchExists = categories.some(
    c => c.name.toLowerCase() === searchText.trim().toLowerCase()
  )
  const showCreateOption = searchText.trim() !== '' && !exactMatchExists && onCreateCategory

  const totalItems = filteredCategories.length + (showCreateOption ? 1 : 0)

  // Handle clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
        const cat = categories.find(c => String(c.id) === String(value))
        if (cat) {
          setSearchText(cat.name)
        } else {
          setSearchText('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [value, categories])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchText])

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => 
          prev < totalItems - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : totalItems - 1
        )
        break
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          e.preventDefault()
          if (highlightedIndex < filteredCategories.length) {
            selectCategory(filteredCategories[highlightedIndex])
          } else if (showCreateOption) {
            handleCreateCategory()
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
      case 'Tab':
        setIsOpen(false)
        break
      default:
        break
    }
  }

  const selectCategory = (cat) => {
    setSearchText(cat.name)
    onChange(cat.id)
    setIsOpen(false)
  }

  const handleCreateCategory = async () => {
    if (onCreateCategory) {
      const newCategory = await onCreateCategory(searchText.trim())
      if (newCategory) {
        setSearchText(newCategory.name)
        onChange(newCategory.id)
        setIsOpen(false)
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={searchText}
        onChange={(e) => {
          setSearchText(e.target.value)
          if (e.target.value !== (selectedCategory ? selectedCategory.name : '')) {
            onChange('')
          }
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required && !value}
        disabled={disabled}
        className={`${className} w-full`}
        autoComplete="off"
      />
      <input type="hidden" value={value || ''} required={required} />
      
      {isOpen && (totalItems > 0) && (
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 divide-y divide-gray-50 py-1 transition-all duration-150 ease-out animate-fade-in-down">
          {filteredCategories.map((cat, index) => {
            const isHighlighted = index === highlightedIndex
            const matchIndex = cat.name.toLowerCase().indexOf((searchText || '').toLowerCase())
            const searchActive = searchText && (!selectedCategory || searchText !== selectedCategory.name)
            const hasMatch = matchIndex !== -1 && searchActive
            
            const beforeMatch = hasMatch ? cat.name.slice(0, matchIndex) : cat.name
            const matchText = hasMatch ? cat.name.slice(matchIndex, matchIndex + searchText.length) : ''
            const afterMatch = hasMatch ? cat.name.slice(matchIndex + searchText.length) : ''

            return (
              <li
                key={cat.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectCategory(cat)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-4 py-2 text-sm cursor-pointer transition-colors duration-150 flex items-center justify-between ${
                  isHighlighted 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">
                  {hasMatch ? (
                    <>
                      {beforeMatch}
                      <span className="font-bold text-blue-600">{matchText}</span>
                      {afterMatch}
                    </>
                  ) : (
                    cat.name
                  )}
                </span>
              </li>
            )
          })}
          
          {showCreateOption && (
            <li
              onMouseDown={(e) => {
                e.preventDefault()
                handleCreateCategory()
              }}
              onMouseEnter={() => setHighlightedIndex(filteredCategories.length)}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors duration-150 flex items-center gap-2 ${
                highlightedIndex === filteredCategories.length
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-blue-600 hover:bg-blue-50 font-medium'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ Create "{searchText.trim()}"</span>
            </li>
          )}
        </ul>
      )}
      {isOpen && totalItems === 0 && (
        <div className="absolute left-0 right-0 mt-1 p-3 bg-white border border-gray-200 rounded-xl shadow-xl z-50 text-center text-sm text-gray-500">
          No categories found. Start typing to create one.
        </div>
      )}
    </div>
  )
}
