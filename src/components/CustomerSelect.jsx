import { useState, useEffect, useRef } from 'react'

export default function CustomerSelect({
  value,
  onChange,
  customers = [],
  placeholder = 'Select customer...',
  className = '',
  required = false,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)

  const selectedCustomer = customers.find(c => String(c.id) === String(value))
  const [searchText, setSearchText] = useState(selectedCustomer ? selectedCustomer.name : '')

  useEffect(() => {
    const cust = customers.find(c => String(c.id) === String(value))
    if (cust) {
      setSearchText(cust.name)
    } else if (!value) {
      setSearchText('')
    }
  }, [value, customers])

  // Filter customers based on search text
  const filteredCustomers = customers.filter((c) => {
    if (!c || !c.name) return false
    // If the search text is exactly the selected customer's name, show all so dropdown can be opened to change
    if (selectedCustomer && searchText === selectedCustomer.name) return true
    if (!searchText) return true
    return c.name.toLowerCase().includes(searchText.toLowerCase())
  })

  // Handle clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
        // Revert to selected customer name if user clicked away without selecting a new one
        const cust = customers.find(c => String(c.id) === String(value))
        if (cust) {
          setSearchText(cust.name)
        } else {
          setSearchText('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [value, customers])

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
          prev < filteredCustomers.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => 
          prev > 0 ? prev - 1 : filteredCustomers.length - 1
        )
        break
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < filteredCustomers.length) {
          e.preventDefault()
          selectCustomer(filteredCustomers[highlightedIndex])
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

  const selectCustomer = (cust) => {
    setSearchText(cust.name)
    onChange(cust.id)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={searchText}
        onChange={(e) => {
          setSearchText(e.target.value)
          // If user starts typing, clear the selected value
          if (e.target.value !== (selectedCustomer ? selectedCustomer.name : '')) {
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
      {/* Hidden input to ensure required validation works correctly on form submit if we want to submit the ID */}
      <input type="hidden" value={value || ''} required={required} />
      
      {isOpen && filteredCustomers.length > 0 && (
        <ul className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 divide-y divide-gray-50 py-1 transition-all duration-150 ease-out animate-fade-in-down">
          {filteredCustomers.map((cust, index) => {
            const isHighlighted = index === highlightedIndex
            
            // Highlight matching text portion
            const matchIndex = cust.name.toLowerCase().indexOf((searchText || '').toLowerCase())
            // Only highlight if the search text is not exactly the selected name
            const searchActive = searchText && (!selectedCustomer || searchText !== selectedCustomer.name)
            const hasMatch = matchIndex !== -1 && searchActive
            
            const beforeMatch = hasMatch ? cust.name.slice(0, matchIndex) : cust.name
            const matchText = hasMatch ? cust.name.slice(matchIndex, matchIndex + searchText.length) : ''
            const afterMatch = hasMatch ? cust.name.slice(matchIndex + searchText.length) : ''

            return (
              <li
                key={cust.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectCustomer(cust)
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
                    cust.name
                  )}
                </span>
                {cust.phone && (
                  <span className="text-xs text-gray-400 ml-2">{cust.phone}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {isOpen && filteredCustomers.length === 0 && (
        <div className="absolute left-0 right-0 mt-1 p-3 bg-white border border-gray-200 rounded-xl shadow-xl z-50 text-center text-sm text-gray-500">
          No customers found matching "{searchText}"
        </div>
      )}
    </div>
  )
}
