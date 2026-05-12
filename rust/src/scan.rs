//! Port + process scanning.

use std::collections::HashMap;
use std::net::IpAddr;

use anyhow::Result;
use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState};
use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind, Users};

#[derive(Debug, Clone, Serialize)]
pub struct Conn {
    pub port: u16,
    pub proto: &'static str,
    pub state: String,
    pub pid: Option<u32>,
    pub process: String,
    pub user: String,
    pub local: String,
    pub remote: String,
    pub service: &'static str,
    pub ipv6: bool,
}

pub struct Scanner {
    sys: System,
    users: Users,
    pid_cache: HashMap<u32, (String, String)>,
}

impl Default for Scanner {
    fn default() -> Self {
        Self::new()
    }
}

impl Scanner {
    pub fn new() -> Self {
        let sys = System::new();
        let users = Users::new_with_refreshed_list();
        Self {
            sys,
            users,
            pid_cache: HashMap::new(),
        }
    }

    pub fn refresh_processes(&mut self) {
        let kind = ProcessRefreshKind::new()
            .with_user(UpdateKind::OnlyIfNotSet)
            .with_exe(UpdateKind::OnlyIfNotSet);
        self.sys
            .refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
        self.pid_cache.clear();
    }

    fn pid_info(&mut self, pid: u32) -> (String, String) {
        if let Some(cached) = self.pid_cache.get(&pid) {
            return cached.clone();
        }
        let (name, user) = match self.sys.process(Pid::from(pid as usize)) {
            Some(p) => {
                let name = p.name().to_string_lossy().into_owned();
                let user = p
                    .user_id()
                    .and_then(|uid| self.users.get_user_by_id(uid))
                    .map(|u| u.name().to_string())
                    .unwrap_or_else(|| "?".into());
                (name, user)
            }
            None => ("?".into(), "?".into()),
        };
        self.pid_cache.insert(pid, (name.clone(), user.clone()));
        (name, user)
    }

    pub fn scan(&mut self, listening_only: bool) -> Result<Vec<Conn>> {
        self.refresh_processes();

        let af = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
        let proto = ProtocolFlags::TCP | ProtocolFlags::UDP;
        let sockets = get_sockets_info(af, proto)?;

        let mut out = Vec::with_capacity(sockets.len());
        let mut seen: std::collections::HashSet<(u16, &str, Option<u32>, String, String)> =
            std::collections::HashSet::new();

        for si in sockets {
            let pids = si.associated_pids.clone();
            let pid = pids.first().copied();

            let (proto, state, port, local, remote, ipv6) = match si.protocol_socket_info {
                ProtocolSocketInfo::Tcp(t) => {
                    let st: String = format!("{}", t.state);
                    if listening_only && t.state != TcpState::Listen {
                        continue;
                    }
                    let ipv6 = matches!(t.local_addr, IpAddr::V6(_));
                    let local = fmt_addr(t.local_addr, t.local_port);
                    let remote = if t.state == TcpState::Listen {
                        "*:*".into()
                    } else {
                        fmt_addr(t.remote_addr, t.remote_port)
                    };
                    ("TCP", st, t.local_port, local, remote, ipv6)
                }
                ProtocolSocketInfo::Udp(u) => {
                    let ipv6 = matches!(u.local_addr, IpAddr::V6(_));
                    let local = fmt_addr(u.local_addr, u.local_port);
                    (
                        "UDP",
                        "LISTEN".into(),
                        u.local_port,
                        local,
                        "*:*".into(),
                        ipv6,
                    )
                }
            };

            let (process, user) = match pid {
                Some(p) => self.pid_info(p),
                None => ("?".into(), "?".into()),
            };

            let key = (port, proto, pid, local.clone(), remote.clone());
            if !seen.insert(key) {
                continue;
            }

            out.push(Conn {
                port,
                proto,
                state,
                pid,
                process,
                user,
                local,
                remote,
                service: well_known(port),
                ipv6,
            });
        }
        Ok(out)
    }
}

fn fmt_addr(ip: IpAddr, port: u16) -> String {
    let s = match ip {
        IpAddr::V4(v) => {
            if v.is_unspecified() {
                "*".into()
            } else {
                v.to_string()
            }
        }
        IpAddr::V6(v) => {
            if v.is_unspecified() {
                "*".into()
            } else {
                format!("[{v}]")
            }
        }
    };
    format!("{s}:{port}")
}

pub fn well_known(port: u16) -> &'static str {
    match port {
        20 => "FTP-data",
        21 => "FTP",
        22 => "SSH",
        23 => "Telnet",
        25 => "SMTP",
        53 => "DNS",
        67 => "DHCP",
        80 => "HTTP",
        110 => "POP3",
        123 => "NTP",
        143 => "IMAP",
        161 => "SNMP",
        389 => "LDAP",
        443 => "HTTPS",
        445 => "SMB",
        465 => "SMTPS",
        587 => "SMTP-sub",
        631 => "IPP",
        636 => "LDAPS",
        993 => "IMAPS",
        995 => "POP3S",
        1433 => "MSSQL",
        1521 => "Oracle",
        2049 => "NFS",
        2375 => "Docker",
        2376 => "Docker-TLS",
        2379 => "etcd",
        3000 => "Node/Dev",
        3306 => "MySQL",
        3389 => "RDP",
        4200 => "Angular",
        4222 => "NATS",
        4369 => "Erlang",
        5000 => "Flask",
        5173 => "Vite",
        5432 => "Postgres",
        5601 => "Kibana",
        5672 => "RabbitMQ",
        6379 => "Redis",
        6443 => "K8s-API",
        6666 => "IRC",
        7777 => "Game",
        8000 => "HTTP-dev",
        8080 => "HTTP-alt",
        8086 => "InfluxDB",
        8443 => "HTTPS-alt",
        8888 => "Jupyter",
        9000 => "PHP-FPM",
        9092 => "Kafka",
        9200 => "ES",
        9300 => "ES-tx",
        11211 => "Memcached",
        15672 => "RMQ-mgmt",
        25565 => "Minecraft",
        27017 => "MongoDB",
        50000 => "DB2",
        _ => "",
    }
}
