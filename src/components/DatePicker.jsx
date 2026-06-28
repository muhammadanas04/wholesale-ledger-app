import React from 'react';

export default function DatePicker({ value, onChange, className, ...props }) {
  // Format YYYY-MM-DD to dd/mm/yyyy
  const displayDate = value ? value.split('-').reverse().join('/') : '';
  
  return (
    <div className={`relative flex items-center ${className || ''}`}>
      <span className="pointer-events-none whitespace-nowrap opacity-90">{displayDate || 'dd/mm/yyyy'}</span>
      <input
        {...props}
        type="date"
        value={value}
        onChange={onChange}
        onClick={(e) => {
          try {
            e.target.showPicker();
          } catch(err) {}
          if (props.onClick) props.onClick(e);
        }}
        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
      />
    </div>
  );
}
