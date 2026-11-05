'use client';

/**
 * State and City fields for Indian addresses:
 * - StateSelect lists all 36 states and union territories (an old typed value like "UP" is shown as its state).
 * - CityInput suggests the cities and towns of the chosen state (or of all India while no state is chosen);
 *   any other name can still be typed.
 */
import { useId, useMemo } from 'react';
import { INDIA_STATES, citiesFor, findState, stateOfCity } from '../../lib/india-places';

/** value / onChange carry the state NAME; onPick(state) also gets { code, name } (code = GST state code). */
export function StateSelect({ value, onChange, onPick, className = 'input-field', placeholder = 'State', ...rest }) {
  const known = findState(value);
  const current = known ? known.name : (value || '');
  return (
    <select
      className={className}
      value={current}
      onChange={(e) => {
        onChange?.(e.target.value);
        const st = findState(e.target.value);
        if (st) onPick?.(st);
      }}
      {...rest}
    >
      <option value="">{placeholder}</option>
      {INDIA_STATES.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
      {current && !known && <option value={current}>{current} (as saved)</option>}
    </select>
  );
}

/** A city box with suggestions; onStateGuess(state) runs when a city is picked while no state is set. */
export function CityInput({ value, onChange, state, onStateGuess, className = 'input-field', placeholder = 'City', ...rest }) {
  const listId = `cities-${useId().replace(/:/g, '')}`;
  const options = useMemo(() => {
    if (findState(state)) return findState(state).cities;
    return String(value || '').trim().length >= 2 ? citiesFor(null, value, 40) : [];
  }, [state, value]);
  const settle = (city) => {
    if (!state && onStateGuess) {
      const st = stateOfCity(city);
      if (st) onStateGuess(st);
    }
  };
  return (
    <>
      <input
        className={className}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        value={value || ''}
        onChange={(e) => {
          onChange?.(e.target.value);
          if (options.includes(e.target.value)) settle(e.target.value); // picked from the list
        }}
        onBlur={(e) => settle(e.target.value)}
        {...rest}
      />
      <datalist id={listId}>
        {options.map((c) => <option key={c} value={c} />)}
      </datalist>
    </>
  );
}
