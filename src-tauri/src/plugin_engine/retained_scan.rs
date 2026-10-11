use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

/// Keep one scan alive across probes, with a short caller wait. Scope changes invalidate
/// retained data immediately; the old worker finishes before another scan starts.
#[derive(Default)]
pub(super) struct RetainedScan {
    scope: String,
    running: Option<(String, Receiver<String>)>,
    retained: Option<String>,
}

impl RetainedScan {
    pub(super) fn value(
        &mut self,
        scope: String,
        wait: Duration,
        operation: impl FnOnce() -> String + Send + 'static,
    ) -> Option<String> {
        if self.scope != scope {
            self.scope = scope.clone();
            self.retained = None;
        }
        if self.running.is_none() {
            let (sender, receiver) = mpsc::channel();
            self.running = Some((scope, receiver));
            std::thread::spawn(move || {
                let _ = sender.send(operation());
            });
        }
        let (running_scope, receiver) = self.running.as_ref().unwrap();
        match receiver.recv_timeout(wait) {
            Ok(value) => {
                if *running_scope == self.scope {
                    self.retained = Some(value);
                }
                self.running = None;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                eprintln!("Codex history worker disconnected before returning a result");
                self.retained = None;
                self.running = None;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        self.retained.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};

    #[test]
    fn slow_scan_returns_without_waiting_and_is_consumed_on_next_probe() {
        let mut scan = RetainedScan::default();
        let (release, blocked) = mpsc::channel();
        let (done, finished) = mpsc::channel();
        let calls = Arc::new(AtomicUsize::new(0));
        let worker_calls = calls.clone();
        assert_eq!(scan.value("a".into(), Duration::ZERO, move || {
            worker_calls.fetch_add(1, Ordering::SeqCst);
            blocked.recv().unwrap();
            done.send(()).unwrap();
            "history-a".into()
        }), None);
        assert_eq!(scan.value("a".into(), Duration::ZERO, || panic!("overlap")), None);
        release.send(()).unwrap();
        finished.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(scan.value("a".into(), Duration::from_secs(2), || panic!("overlap")), Some("history-a".into()));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let (_release, blocked) = mpsc::channel::<()>();
        assert_eq!(scan.value("a".into(), Duration::ZERO, move || {
            let _ = blocked.recv();
            "updated".into()
        }), Some("history-a".into()));
    }

    #[test]
    fn account_or_date_change_drops_old_result_without_starting_overlapping_scan() {
        let mut scan = RetainedScan::default();
        let (release, blocked) = mpsc::channel();
        scan.value("account-a/day-1".into(), Duration::ZERO, move || {
            blocked.recv().unwrap();
            "old-account".into()
        });
        assert_eq!(scan.value("account-b/day-2".into(), Duration::ZERO, || panic!("overlap")), None);
        release.send(()).unwrap();
        assert_eq!(scan.value("account-b/day-2".into(), Duration::from_secs(2), || panic!("overlap")), None);
        assert_eq!(scan.value("account-b/day-2".into(), Duration::from_secs(2), || "new-account".into()), Some("new-account".into()));
    }

    #[test]
    fn independent_homes_do_not_share_results() {
        let mut first = RetainedScan::default();
        let mut second = RetainedScan::default();
        assert_eq!(first.value("a".into(), Duration::from_secs(2), || "home-a".into()), Some("home-a".into()));
        assert_eq!(second.value("a".into(), Duration::from_secs(2), || "home-b".into()), Some("home-b".into()));
    }
}
