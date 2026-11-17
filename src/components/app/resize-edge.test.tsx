import { fireEvent, render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({}) }))

import { ResizeEdge } from "@/components/app/app-shell"

describe("ResizeEdge", () => {
  it("sends one width at a time, the newest, and keeps it once the last one is done", async () => {
    const done: Array<() => void> = []
    const resize = vi.fn(() => new Promise<void>((resolve) => done.push(resolve)))
    const keep = vi.fn()
    const { container } = render(<ResizeEdge side="West" width={() => 400} resize={resize} keep={keep} />)
    const strip = container.firstElementChild!

    fireEvent.pointerDown(strip, { button: 0, buttons: 1, screenX: 1000, pointerId: 1 })
    fireEvent.pointerMove(strip, { buttons: 1, screenX: 990, pointerId: 1 })
    fireEvent.pointerMove(strip, { buttons: 1, screenX: 980, pointerId: 1 })
    fireEvent.pointerMove(strip, { buttons: 1, screenX: 950, pointerId: 1 })
    fireEvent.pointerUp(strip, { pointerId: 1 })
    // The left edge moved left: wider. Only the first width went out; the others wait for it.
    expect(resize.mock.calls).toEqual([[410, "West"]])
    expect(keep).not.toHaveBeenCalled()

    done[0]()
    await waitFor(() => expect(resize).toHaveBeenCalledTimes(2))
    expect(resize).toHaveBeenLastCalledWith(450, "West") // the newest; 420 was dropped
    expect(keep).not.toHaveBeenCalled()

    done[1]()
    await waitFor(() => expect(keep).toHaveBeenCalledTimes(1))
  })

  it("ends a drag whose button came up where no pointerup reached it", () => {
    const resize = vi.fn().mockResolvedValue(undefined)
    const keep = vi.fn()
    const { container } = render(<ResizeEdge side="East" width={() => 400} resize={resize} keep={keep} />)
    const strip = container.firstElementChild!

    fireEvent.pointerDown(strip, { button: 0, buttons: 1, screenX: 1000, pointerId: 1 })
    fireEvent.pointerMove(strip, { buttons: 0, screenX: 1100, pointerId: 1 })
    fireEvent.pointerMove(strip, { buttons: 0, screenX: 1200, pointerId: 1 })
    expect(resize).not.toHaveBeenCalled()
    expect(keep).toHaveBeenCalledTimes(1)
  })
})
