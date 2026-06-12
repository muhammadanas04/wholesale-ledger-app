import { useState, useEffect, useRef } from 'react'

export default function SuggestionInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '',
  className = '',
  required = false,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)

  // Filter suggestions based on current input text (case-insensitive substring match)
  const filteredSuggestions = suggestions.filter((item) => {
    if (!item) return false
    if (!value) return true // Show all when empty but focused, like YouTube/Google history/search
    return item.toLowerCase().includes(value.toLowerCase())
  })

  // Handle clicking outside the component to close suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Keep highlighted index within bounds when suggestions list changes
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [value])

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
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        )
        break
      case 'Enter':
        // If an item is highlighted, select it
        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
          e.preventDefault()
          selectSuggestion(filteredSuggestions[highlightedIndex])
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

  const selectSuggestion = (val) => {
    onChange(val)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`${className} w-full`}
      />
      {isOpen && filteredSuggestions.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 divide-y divide-gray-50 py-1 transition-all duration-150 ease-out animate-fade-in-down">
          {filteredSuggestions.map((item, index) => {
            const isHighlighted = index === highlightedIndex
            
            // Highlight matching text portion
            const matchIndex = item.toLowerCase().indexOf((value || '').toLowerCase())
            const hasMatch = matchIndex !== -1 && value.length > 0
            
            const beforeMatch = hasMatch ? item.slice(0, matchIndex) : item
            const matchText = hasMatch ? item.slice(matchIndex, matchIndex + value.length) : ''
            const afterMatch = hasMatch ? item.slice(matchIndex + value.length) : ''

            return (
              <li
                key={index}
                onMouseDown={(e) => {
                  // Prevent input blur before click event registers
                  e.preventDefault()
                  selectSuggestion(item)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-4 py-2 text-sm cursor-pointer transition-colors duration-150 flex items-center ${
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
                    item
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
