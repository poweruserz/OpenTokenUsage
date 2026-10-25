import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { StripPlacement } from "@/components/strip-placement"

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
beforeEach(() => invokeMock.mockResolvedValue(false))

function renderControls() {
  const onChange = vi.fn()
  function Controls() {
    const [placement, setPlacement] = useState({ position: "right" as "left" | "right", offset: 8 })
    return (
      <StripPlacement
        {...placement}
        onChange={(patch) => {
          onChange(patch)
          setPlacement((previous) => ({ ...previous, ...patch }))
        }}
      />
    )
  }
  render(<Controls />)
  return onChange
}

it("selects either side and accepts only whole, bounded offsets", () => {
  const onChange = renderControls()
  expect(screen.getByRole("radio", { name: "Right" })).toHaveAttribute("aria-checked", "true")
  fireEvent.click(screen.getByRole("radio", { name: "Left" }))
  expect(onChange).toHaveBeenLastCalledWith({ position: "left" })
  expect(screen.getByRole("radio", { name: "Left" })).toHaveAttribute("aria-checked", "true")
  fireEvent.click(screen.getByRole("radio", { name: "Right" }))
  expect(onChange).toHaveBeenLastCalledWith({ position: "right" })

  const input = screen.getByRole("spinbutton", { name: "Offset (px)" })
  fireEvent.change(input, { target: { value: "120" } })
  expect(onChange).toHaveBeenLastCalledWith({ offset: 120 })
  expect(input).toHaveValue(120)
  onChange.mockClear()
  for (const value of ["", "-1", "1.5", "4097"]) fireEvent.change(input, { target: { value } })
  expect(onChange).not.toHaveBeenCalled()
  for (const value of ["0", "4096"]) {
    fireEvent.change(input, { target: { value } })
    expect(onChange).toHaveBeenLastCalledWith({ offset: Number(value) })
  }
})

it("calls the free side Center when Windows aligns the taskbar icons left", async () => {
  invokeMock.mockResolvedValue(true)
  const onChange = renderControls()
  fireEvent.click(await screen.findByRole("radio", { name: "Center" }))
  expect(invokeMock).toHaveBeenCalledWith("taskbar_icons_left")
  expect(onChange).toHaveBeenLastCalledWith({ position: "left" })
})

it("lets users clear and retype an offset, and restores invalid drafts on blur", async () => {
  const user = userEvent.setup()
  const onChange = renderControls()
  const input = screen.getByRole("spinbutton", { name: "Offset (px)" })
  await user.clear(input)
  expect(input).toHaveValue(null)
  expect(onChange).not.toHaveBeenCalled()
  await user.type(input, "120")
  expect(input).toHaveValue(120)
  expect(onChange).toHaveBeenLastCalledWith({ offset: 120 })
  await user.tab()
  expect(input).toHaveValue(120)

  await user.clear(input)
  await user.tab()
  expect(input).toHaveValue(120)
  fireEvent.change(input, { target: { value: "4097" } })
  expect(input).toHaveValue(4097)
  fireEvent.blur(input)
  expect(input).toHaveValue(120)
})
