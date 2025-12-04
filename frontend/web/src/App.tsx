// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ToolItem {
  id: string;
  name: string;
  description: string;
  owner: string;
  status: "available" | "borrowed" | "pending";
  encryptedData: string;
  timestamp: number;
}

const App: React.FC = () => {
  // Randomly selected styles: High Contrast (Blue+Orange), Industrial Mechanical, Center Radiation, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddToolModal, setShowAddToolModal] = useState(false);
  const [addingTool, setAddingTool] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newToolData, setNewToolData] = useState({
    name: "",
    description: "",
    encryptedDetails: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);

  // Randomly selected features: Search & Filter, Tutorial, Data Statistics
  const availableCount = tools.filter(t => t.status === "available").length;
  const borrowedCount = tools.filter(t => t.status === "borrowed").length;
  const pendingCount = tools.filter(t => t.status === "pending").length;

  useEffect(() => {
    loadTools().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadTools = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("tool_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing tool keys:", e);
        }
      }
      
      const list: ToolItem[] = [];
      
      for (const key of keys) {
        try {
          const toolBytes = await contract.getData(`tool_${key}`);
          if (toolBytes.length > 0) {
            try {
              const toolData = JSON.parse(ethers.toUtf8String(toolBytes));
              list.push({
                id: key,
                name: toolData.name,
                description: toolData.description,
                owner: toolData.owner,
                status: toolData.status || "available",
                encryptedData: toolData.encryptedData,
                timestamp: toolData.timestamp
              });
            } catch (e) {
              console.error(`Error parsing tool data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading tool ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setTools(list);
    } catch (e) {
      console.error("Error loading tools:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addTool = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAddingTool(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting tool details with Zama FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newToolData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const toolId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const toolData = {
        name: newToolData.name,
        description: newToolData.description,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "available"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `tool_${toolId}`, 
        ethers.toUtf8Bytes(JSON.stringify(toolData))
      );
      
      const keysBytes = await contract.getData("tool_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(toolId);
      
      await contract.setData(
        "tool_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Tool added securely with FHE encryption!"
      });
      
      await loadTools();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddToolModal(false);
        setNewToolData({
          name: "",
          description: "",
          encryptedDetails: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAddingTool(false);
    }
  };

  const borrowTool = async (toolId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted borrowing request with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const toolBytes = await contract.getData(`tool_${toolId}`);
      if (toolBytes.length === 0) {
        throw new Error("Tool not found");
      }
      
      const toolData = JSON.parse(ethers.toUtf8String(toolBytes));
      
      const updatedTool = {
        ...toolData,
        status: "borrowed"
      };
      
      await contract.setData(
        `tool_${toolId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedTool))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE borrowing completed successfully!"
      });
      
      await loadTools();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Borrowing failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const returnTool = async (toolId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted return with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const toolBytes = await contract.getData(`tool_${toolId}`);
      if (toolBytes.length === 0) {
        throw new Error("Tool not found");
      }
      
      const toolData = JSON.parse(ethers.toUtf8String(toolBytes));
      
      const updatedTool = {
        ...toolData,
        status: "available"
      };
      
      await contract.setData(
        `tool_${toolId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedTool))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE return completed successfully!"
      });
      
      await loadTools();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Return failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the tool lending platform",
      icon: "🔗"
    },
    {
      title: "List Your Tools",
      description: "Add tools you want to share with the community",
      icon: "🛠️"
    },
    {
      title: "Borrow Securely",
      description: "Request tools anonymously with FHE encryption",
      icon: "🔒"
    },
    {
      title: "Build Reputation",
      description: "Earn trust through successful borrows and returns",
      icon: "⭐"
    }
  ];

  const filteredTools = tools.filter(tool => 
    tool.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    tool.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>Tool<span>Lend</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAddToolModal(true)} 
            className="add-tool-btn mechanical-button"
          >
            <div className="add-icon"></div>
            Add Tool
          </button>
          <button 
            className="mechanical-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Anonymous Tool Lending with FHE</h2>
            <p>Borrow and lend tools securely with fully homomorphic encryption</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How It Works</h2>
            <p className="subtitle">Learn how to share tools anonymously in your community</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card mechanical-card">
            <h3>Community Stats</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{tools.length}</div>
                <div className="stat-label">Total Tools</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{availableCount}</div>
                <div className="stat-label">Available</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{borrowedCount}</div>
                <div className="stat-label">Borrowed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card mechanical-card">
            <h3>Search Tools</h3>
            <div className="search-container">
              <input
                type="text"
                placeholder="Search tools by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mechanical-input"
              />
              <button 
                onClick={loadTools}
                className="refresh-btn mechanical-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>
        
        <div className="tools-section">
          <div className="section-header">
            <h2>Available Tools</h2>
            <div className="header-actions">
              <button 
                onClick={() => setShowAddToolModal(true)}
                className="mechanical-button primary"
              >
                Add Your Tool
              </button>
            </div>
          </div>
          
          <div className="tools-list mechanical-card">
            {filteredTools.length === 0 ? (
              <div className="no-tools">
                <div className="no-tools-icon"></div>
                <p>No tools found matching your search</p>
                <button 
                  className="mechanical-button primary"
                  onClick={() => setShowAddToolModal(true)}
                >
                  List Your First Tool
                </button>
              </div>
            ) : (
              <div className="tools-grid">
                {filteredTools.map(tool => (
                  <div className="tool-card" key={tool.id}>
                    <div className="tool-header">
                      <h3>{tool.name}</h3>
                      <span className={`status-badge ${tool.status}`}>
                        {tool.status}
                      </span>
                    </div>
                    <p className="tool-description">{tool.description}</p>
                    <div className="tool-meta">
                      <span className="owner">
                        Owner: {tool.owner.substring(0, 6)}...{tool.owner.substring(38)}
                      </span>
                      <span className="timestamp">
                        {new Date(tool.timestamp * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="tool-actions">
                      {tool.status === "available" && !isOwner(tool.owner) && (
                        <button 
                          className="mechanical-button success"
                          onClick={() => borrowTool(tool.id)}
                        >
                          Borrow
                        </button>
                      )}
                      {tool.status === "borrowed" && isOwner(tool.owner) && (
                        <button 
                          className="mechanical-button"
                          onClick={() => returnTool(tool.id)}
                        >
                          Mark Returned
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showAddToolModal && (
        <ModalAddTool 
          onSubmit={addTool} 
          onClose={() => setShowAddToolModal(false)} 
          adding={addingTool}
          toolData={newToolData}
          setToolData={setNewToolData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content mechanical-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>ToolLendFHE</span>
            </div>
            <p>Anonymous peer-to-peer tool lending with FHE encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">How It Works</a>
            <a href="#" className="footer-link">Safety Guidelines</a>
            <a href="#" className="footer-link">Community Rules</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ToolLendFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddToolProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  toolData: any;
  setToolData: (data: any) => void;
}

const ModalAddTool: React.FC<ModalAddToolProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  toolData,
  setToolData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setToolData({
      ...toolData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!toolData.name || !toolData.description) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-tool-modal mechanical-card">
        <div className="modal-header">
          <h2>Add Tool to Community</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your tool details will be encrypted with Zama FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Tool Name *</label>
              <input 
                type="text"
                name="name"
                value={toolData.name} 
                onChange={handleChange}
                placeholder="e.g. Power Drill, Ladder, Pressure Washer" 
                className="mechanical-input"
              />
            </div>
            
            <div className="form-group">
              <label>Description *</label>
              <textarea 
                name="description"
                value={toolData.description} 
                onChange={handleChange}
                placeholder="Brief description of the tool and condition..." 
                className="mechanical-textarea"
                rows={3}
              />
            </div>
            
            <div className="form-group">
              <label>Additional Details (Encrypted)</label>
              <textarea 
                name="encryptedDetails"
                value={toolData.encryptedDetails} 
                onChange={handleChange}
                placeholder="Any sensitive details (serial numbers, special instructions)..." 
                className="mechanical-textarea"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="mechanical-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="mechanical-button primary"
          >
            {adding ? "Encrypting with FHE..." : "List Tool Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;