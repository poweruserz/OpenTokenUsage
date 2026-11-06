import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Progress } from "@/components/ui/progress"

describe("Progress", () => {
  it("notches the bar at each tick inside it, not at its ends", () => {
    const { container } = render(<Progress value={40} ticks={[0, 20, 80, 100]} />)
    const ticks = [...container.querySelectorAll<HTMLElement>('[data-slot="progress-tick"]')]
    expect(ticks.map((tick) => tick.style.left)).toEqual(["20%", "80%"])
  })
})
