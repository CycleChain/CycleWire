import { useEffect, useRef, useState } from 'react';

/**
 * A React component with a CycleWire action inside it: "Save" is a plain
 * cw-action, and its props are whatever React rendered last.
 */
export function Counter({ start = 0 }) {
    const [count, setCount] = useState(start);
    const [saved, setSaved] = useState(null);
    const [ready, setReady] = useState(false);
    const root = useRef(null);

    useEffect(() => {
        setReady(true);
        // CycleWire reports an action's result with a cw:done event that
        // bubbles up from the element the action is bound to.
        const done = (event) => {
            if (event.detail.action === 'counter#save') setSaved(event.detail.result.count);
        };
        const element = root.current;
        element.addEventListener('cw:done', done);
        return () => element.removeEventListener('cw:done', done);
    }, []);

    return (
        <div className="counter" ref={root} data-ready={ready || undefined}>
            <output className="counter__value">{count}</output>
            <button type="button" className="counter__inc" onClick={() => setCount(count + 1)}>+1</button>
            <button type="button" className="counter__save primary" cw-action="counter#save" cw-props={JSON.stringify({ count })}>
                Save
            </button>
            <p className="counter__status" role="status">{saved === null ? 'Not saved yet' : `Saved ${saved}`}</p>
        </div>
    );
}
