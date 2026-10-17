//! Taskbar-relative coordinates; offsets are logical pixels at 96 DPI.

#[derive(Clone, Copy, Debug, Default, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum Side {
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

impl Placement {
    pub fn validate(self) -> Result<Self, String> {
        if self.offset > 4096 {
            return Err("strip offset out of range".into());
        }
        Ok(self)
    }

    /// `available` ends at the notification area/clock, in taskbar-local physical pixels.
    /// Clamp an oversized inset, but hide a strip that cannot fit at all.
    pub fn x(self, available: i32, width: i32, dpi: u32) -> Option<i32> {
        if width <= 0 || available < width {
            return None;
        }
        let max_x = available - width;
        let inset = (self.offset as i64 * dpi as i64 / 96).min(max_x as i64) as i32;
        Some(match self.side {
            Side::Left => inset,
            Side::Right => max_x - inset,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_default_and_scales_both_edges() {
        assert_eq!(Placement::default().x(1800, 200, 96), Some(1592));
        let left = Placement {
            side: Side::Left,
            offset: 24,
        };
        let right = Placement {
            side: Side::Right,
            offset: 24,
        };
        assert_eq!(left.x(1800, 200, 144), Some(36));
        assert_eq!(right.x(1800, 200, 144), Some(1564));
        assert_eq!(left.x(2700, 300, 144), Some(36));
    }

    #[test]
    fn stays_inside_each_taskbar_and_out_of_the_tray() {
        for side in [Side::Left, Side::Right] {
            let p = Placement { side, offset: 4096 };
            let x = p.x(500, 200, 480).unwrap();
            assert!((0..=300).contains(&x));
            assert_eq!(p.x(200, 200, 96), Some(0));
            assert_eq!(p.x(100, 200, 96), None);
            assert_eq!(p.x(-10, 200, 96), None);
        }
    }

    #[test]
    fn rejects_invalid_ipc_values() {
        assert!(serde_json::from_str::<Placement>(r#"{"side":"center","offset":8}"#).is_err());
        assert!(serde_json::from_str::<Placement>(r#"{"side":"left","offset":-1}"#).is_err());
        assert!(Placement {
            side: Side::Left,
            offset: 4097,
        }
        .validate()
        .is_err());
    }
}
