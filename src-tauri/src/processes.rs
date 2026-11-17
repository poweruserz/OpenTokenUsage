//! The running processes (Toolhelp snapshot): pid, parent pid and lower-case exe file name.

pub struct Process {
    pub pid: u32,
    pub parent: u32,
    /// e.g. "codex.exe".
    pub exe: String,
}

#[cfg(windows)]
pub fn snapshot() -> Vec<Process> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let mut list = Vec::new();
    // SAFETY: the snapshot handle is checked and closed once; the entry is a local with its size set.
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return list;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snap, &mut entry) != 0;
        while more {
            let len = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            list.push(Process {
                pid: entry.th32ProcessID,
                parent: entry.th32ParentProcessID,
                exe: String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase(),
            });
            more = Process32NextW(snap, &mut entry) != 0;
        }
        CloseHandle(snap);
    }
    list
}

#[cfg(not(windows))]
pub fn snapshot() -> Vec<Process> {
    Vec::new()
}
