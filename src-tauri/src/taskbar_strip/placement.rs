//! Taskbar-relative coordinates; offsets are logical pixels at 96 DPI.

#[derive(Clone, Copy, Debug, Default, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum Side {
    /// The free side away from the tray: the taskbar's left edge, or its middle when Windows
    /// aligns the icons left (Start and the apps fill the left edge then). Settings calls it Center.
    Left,
    #[default]
    Right,
}

#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct Placement {
    side: Side,
    offset: u32,
}

impl Default for Placement {
    fn default() -> Self {
        Self {
            side: Side::Right,
            offset: 8,
        }
    }
}

/// What a taskbar holds, in taskbar-local physical pixels.
pub struct Layout {
    pub width: i32,
    /// Where the notification area (or a secondary taskbar's clock) starts.
    pub tray_left: i32,
    /// Start, Widgets, app and tray buttons as `(left, right)`; empty when they can't be measured.
    pub occupied: Vec<(i32, i32)>,
    /// Windows aligns the taskbar icons left instead of centering them.
    pub icons_left: bool,
}

impl Layout {
    /// The free stretches between the buttons, left to right.
    fn gaps(&self) -> Vec<(i32, i32)> {
        let mut spans = self.occupied.clone();
        spans.push((self.tray_left, self.width));
        spans.sort_unstable();
        let mut gaps = Vec::new();
        let mut start = 0;
        for (left, right) in spans {
            if left.min(self.width) > start {
                gaps.push((start, left.min(self.width)));
            }
            start = start.max(right);
        }
        gaps
    }
}

impl Placement {
    pub fn validate(self) -> Result<Self, String> {
        if self.offset > 4096 {
            return Err("strip offset out of range".into());
        }
        Ok(self)
    }

    /// Where the strip starts, or None when no free stretch is wide enough.
    pub fn x(self, layout: &Layout, width: i32, dpi: u32) -> Option<i32> {
        if width <= 0 {
            return None;
        }
        let inset = (self.offset as i64 * dpi as i64 / 96) as i32;
        let gaps = layout.gaps();
        let fits = |&&(start, end): &&(i32, i32)| end - start >= width;
        match self.side {
            Side::Right => gaps
                .iter()
                .rev()
                .find(fits)
                .map(|&(start, end)| (end - inset - width).max(start)),
            Side::Left if !layout.icons_left => gaps
                .iter()
                .find(fits)
                .map(|&(start, end)| (start + inset).min(end - width)),
            Side::Left => {
                let middle = (layout.width - width) / 2;
                gaps.iter().find_map(|&(start, end)| {
                    let x = middle.max(start + inset);
                    (x + width <= end).then_some(x)
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bar(tray_left: i32, occupied: &[(i32, i32)], icons_left: bool) -> Layout {
        Layout {
            width: tray_left + 200,
            tray_left,
            occupied: occupied.to_vec(),
            icons_left,
        }
    }

    fn at(side: Side, offset: u32) -> Placement {
        Placement { side, offset }
    }

    #[test]
    fn preserves_default_and_scales_both_edges() {
        let free = bar(1800, &[], false);
        assert_eq!(Placement::default().x(&free, 200, 96), Some(1592));
        assert_eq!(at(Side::Left, 24).x(&free, 200, 144), Some(36));
        assert_eq!(at(Side::Right, 24).x(&free, 200, 144), Some(1564));
        assert_eq!(
            at(Side::Left, 24).x(&bar(2700, &[], false), 300, 144),
            Some(36)
        );
    }

    #[test]
    fn stays_inside_each_taskbar_and_out_of_the_tray() {
        for side in [Side::Left, Side::Right] {
            let p = at(side, 4096);
            let x = p.x(&bar(500, &[], false), 200, 480).unwrap();
            assert!((0..=300).contains(&x));
            assert_eq!(p.x(&bar(200, &[], false), 200, 96), Some(0));
            assert_eq!(p.x(&bar(100, &[], false), 200, 96), None);
            assert_eq!(p.x(&bar(-10, &[], false), 200, 96), None);
        }
    }

    #[test]
    fn left_starts_after_widgets_on_a_centered_taskbar() {
        // Widgets at the far left, then Start and the apps in the middle.
        let layout = bar(2351, &[(0, 160), (1082, 1480)], false);
        assert_eq!(at(Side::Left, 8).x(&layout, 200, 96), Some(168));
    }

    #[test]
    fn right_stays_left_of_widgets_beside_the_tray() {
        // Icons aligned left; Widgets sits next to the tray and leaves a sliver before it.
        let layout = bar(2351, &[(0, 400), (2100, 2340)], true);
        assert_eq!(at(Side::Right, 8).x(&layout, 200, 96), Some(1892));
    }

    #[test]
    fn center_holds_the_middle_until_the_apps_reach_it() {
        // bar(2351, ..) is 2551 wide: the middle for 200 px is 1175; the apps then push it right.
        assert_eq!(
            at(Side::Left, 8).x(&bar(2351, &[(0, 400)], true), 200, 96),
            Some(1175)
        );
        assert_eq!(
            at(Side::Left, 8).x(&bar(2351, &[(0, 1300)], true), 200, 96),
            Some(1308)
        );
        // No stretch after the middle is wide enough: hidden rather than over a button.
        let full = bar(2351, &[(0, 2000), (2100, 2340)], true);
        assert_eq!(at(Side::Left, 8).x(&full, 200, 96), None);
    }

    #[test]
    fn ignores_buttons_outside_the_taskbar() {
        let layout = bar(1800, &[(-50, -10), (5000, 5100)], false);
        assert_eq!(Placement::default().x(&layout, 200, 96), Some(1592));
    }

    #[test]
    fn rejects_invalid_ipc_values() {
        assert!(serde_json::from_str::<Placement>(r#"{"side":"center","offset":8}"#).is_err());
        assert!(serde_json::from_str::<Placement>(r#"{"side":"left","offset":-1}"#).is_err());
        assert!(at(Side::Left, 4097).validate().is_err());
    }
}
