import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

function CNC() {
  const canvasRef = useRef(null);
  const [speed, setSpeed] = useState(200);
  const [commands, setCommands] = useState([]);
  const [gcodeInput, setGcodeInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0);
  const [penColor, setPenColor] = useState('#00ff00');
  const [bgColor, setBgColor] = useState('#1a1a2e');
  const [gridColor, setGridColor] = useState('#2a2a3a');
  const [commandHistory, setCommandHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('editor');
  const [workArea, setWorkArea] = useState({ width: 300, height: 300 });
  const [zeroPosition, setZeroPosition] = useState({ x: 150, y: 150 });
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [toolDiameter, setToolDiameter] = useState(3);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const animationIdRef = useRef(null);

  const samples = {
    'Simple Square': `G0 X0 Y0
G1 X100 Y0
G1 X100 Y100
G1 X0 Y100
G1 X0 Y0`,
    'Star Pattern': `G0 X50 Y0
G1 X60 Y40
G1 X100 Y40
G1 X70 Y60
G1 X80 Y100
G1 X50 Y75
G1 X20 Y100
G1 X30 Y60
G1 X0 Y40
G1 X40 Y40
G1 X50 Y0`,
    'Circle': `G0 X50 Y0
G2 X50 Y0 I0 J50`,
    'Spiral': `G0 X50 Y50
G1 X50 Y55
G2 X55 Y55 I5 J0
G2 X55 Y50 I0 J-5
G2 X45 Y50 I-5 J0
G2 X45 Y55 I0 J5
G2 X55 Y55 I5 J0
G2 X55 Y45 I0 J-5
G2 X45 Y45 I-5 J0
G2 X45 Y55 I0 J5
G2 X55 Y55 I5 J0
G2 X55 Y45 I0 J-5`
  };

  const drawGrid = useCallback((ctx) => {
    const canvas = ctx.canvas;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw work area boundary
    ctx.strokeStyle = '#ff000040';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      zeroPosition.x, 
      zeroPosition.y, 
      workArea.width, 
      workArea.height
    );
    
    // Draw grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    
    // Major grid lines (every 50mm)
    for (let x = zeroPosition.x; x <= zeroPosition.x + workArea.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, zeroPosition.y);
      ctx.lineTo(x, zeroPosition.y + workArea.height);
      ctx.stroke();
    }
    for (let y = zeroPosition.y; y <= zeroPosition.y + workArea.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(zeroPosition.x, y);
      ctx.lineTo(zeroPosition.x + workArea.width, y);
      ctx.stroke();
    }
    
    // Minor grid lines (every 10mm)
    ctx.strokeStyle = `${gridColor}80`;
    for (let x = zeroPosition.x; x <= zeroPosition.x + workArea.width; x += 10) {
      if (x % 50 !== 0) {
        ctx.beginPath();
        ctx.moveTo(x, zeroPosition.y);
        ctx.lineTo(x, zeroPosition.y + workArea.height);
        ctx.stroke();
      }
    }
    for (let y = zeroPosition.y; y <= zeroPosition.y + workArea.height; y += 10) {
      if (y % 50 !== 0) {
        ctx.beginPath();
        ctx.moveTo(zeroPosition.x, y);
        ctx.lineTo(zeroPosition.x + workArea.width, y);
        ctx.stroke();
      }
    }
    
    // Draw axes
    ctx.strokeStyle = '#ff000080';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroPosition.x, zeroPosition.y);
    ctx.lineTo(zeroPosition.x + workArea.width, zeroPosition.y);
    ctx.moveTo(zeroPosition.x, zeroPosition.y);
    ctx.lineTo(zeroPosition.x, zeroPosition.y + workArea.height);
    ctx.stroke();
    
    // Draw origin marker
    ctx.beginPath();
    ctx.arc(zeroPosition.x, zeroPosition.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0000';
    ctx.fill();
  }, [bgColor, gridColor, workArea, zeroPosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 600;
    canvas.height = 600;
    drawGrid(ctx);
  }, [drawGrid]);

  const parseGCode = (gcode) => {
    try {
      const parsed = gcode.trim().split('\n').map((line, i) => {
        line = line.split(';')[0].trim();
        if (!line) return null;
        
        const parts = line.split(' ');
        const cmd = parts.shift();
        const params = {};
        
        parts.forEach(part => {
          if (!part) return;
          const key = part[0].toUpperCase();
          const value = parseFloat(part.slice(1));
          if (!isNaN(value)) {
            params[key] = value;
          }
        });
        
        return { cmd, params, lineNumber: i + 1 };
      }).filter(cmd => cmd !== null);
      
      setCommandHistory(prev => [...prev, { 
        gcode, 
        timestamp: new Date(),
        name: `Program ${prev.length + 1}`
      }]);
      
      setError(null);
      return parsed;
    } catch (e) {
      setError(`Error parsing G-code: ${e.message}`);
      return [];
    }
  };

  const visualizeGCode = (commands) => {
    if (!commands.length) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx);
    
    let currentX = zeroPosition.x;
    let currentY = zeroPosition.y;
    let isCutting = false;
    
    setCurrentCommandIndex(0);
    setIsPlaying(true);
    setSimulationProgress(0);
    
    if (animationIdRef.current) {
      clearTimeout(animationIdRef.current);
    }
    
    const totalCommands = commands.length;
    let completedCommands = 0;
    
    const executeCommand = (index) => {
      if (index >= commands.length) {
        setIsPlaying(false);
        return;
      }
      
      const command = commands[index];
      const { cmd, params } = command;
      
      const newX = zeroPosition.x + (params.X || 0);
      const newY = zeroPosition.y + (params.Y || 0);
      
      if (cmd === 'G0') {
        ctx.strokeStyle = '#0000ff';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        isCutting = false;
      } else if (cmd === 'G1') {
        ctx.strokeStyle = penColor;
        ctx.lineWidth = toolDiameter;
        ctx.setLineDash([]);
        isCutting = true;
      } else if (cmd === 'G2' || cmd === 'G3') {
        const i = params.I || 0;
        const j = params.J || 0;
        const centerX = currentX + i;
        const centerY = currentY + j;
        const radius = Math.sqrt(i*i + j*j);
        const startAngle = Math.atan2(currentY - centerY, currentX - centerX);
        const endAngle = Math.atan2(newY - centerY, newX - centerX);
        
        ctx.strokeStyle = penColor;
        ctx.lineWidth = toolDiameter;
        ctx.setLineDash([]);
        ctx.beginPath();
        if (cmd === 'G2') {
          ctx.arc(centerX, centerY, radius, startAngle, endAngle, true);
        } else {
          ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
        }
        ctx.stroke();
        isCutting = true;
      }
      
      if (cmd !== 'G2' && cmd !== 'G3') {
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(newX, newY);
        ctx.stroke();
      }
      
      if (isCutting) {
        ctx.beginPath();
        ctx.arc(newX, newY, toolDiameter/2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fill();
      }
      
      currentX = newX;
      currentY = newY;
      
      completedCommands++;
      setCurrentCommandIndex(completedCommands);
      setSimulationProgress(Math.round((completedCommands / totalCommands) * 100));
      
      if (index < commands.length - 1) {
        animationIdRef.current = setTimeout(() => executeCommand(index + 1), speed);
      } else {
        setIsPlaying(false);
      }
    };
    
    animationIdRef.current = setTimeout(() => executeCommand(0), speed);
  };

  const handleRun = () => {
    if (isPlaying) {
      handlePause();
      return;
    }
    const parsedCommands = parseGCode(gcodeInput);
    setCommands(parsedCommands);
    if (parsedCommands.length > 0) {
      visualizeGCode(parsedCommands);
    }
  };

  const handlePause = () => {
    if (animationIdRef.current) {
      clearTimeout(animationIdRef.current);
      setIsPlaying(false);
    }
  };

  const handleReset = () => {
    handlePause();
    setCurrentCommandIndex(0);
    setSimulationProgress(0);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx);
  };

  const handleSampleRun = (sample) => {
    setGcodeInput(samples[sample]);
    setActiveTab('editor');
  };

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    const imageUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'cnc-simulation.png';
    a.click();
  };

  const handleDownloadGCode = () => {
    const blob = new Blob([gcodeInput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cnc-program.nc';
    a.click();
  };

  const handleLoadFromHistory = (index) => {
    const program = commandHistory[index];
    setGcodeInput(program.gcode);
    setActiveTab('editor');
  };

  const handleDeleteHistoryItem = (index) => {
    setCommandHistory(prev => prev.filter((_, i) => i !== index));
  };

  const handleWorkAreaChange = (dimension, value) => {
    setWorkArea(prev => ({
      ...prev,
      [dimension]: parseInt(value) || 0
    }));
  };

  const handleZeroPositionChange = (axis, value) => {
    setZeroPosition(prev => ({
      ...prev,
      [axis]: parseInt(value) || 0
    }));
  };

  // Close modals when clicking outside content
  const handleModalClick = (e, modalType) => {
    if (e.target === e.currentTarget) {
      if (modalType === 'help') setShowHelp(false);
      if (modalType === 'settings') setShowSettings(false);
    }
  };

  // Close modals with Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowHelp(false);
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>CNC G-Code Simulator</h1>
        <p>Visualize and test your CNC programs before running them on actual machines</p>
        <div className="header-actions">
          <button onClick={handleDownloadImage}>
            <i className="fas fa-image"></i> Save Image
          </button>
          <button onClick={handleDownloadGCode}>
            <i className="fas fa-download"></i> Download G-Code
          </button>
          <button onClick={() => setShowHelp(true)}>
            <i className="fas fa-question-circle"></i> Help
          </button>
          <button onClick={() => setShowSettings(true)}>
            <i className="fas fa-cog"></i> Settings
          </button>
        </div>
      </header>

      <div className="app-container">
        <div className="sidebar">
          <div className="sidebar-tabs">
            <button 
              className={activeTab === 'editor' ? 'active' : ''}
              onClick={() => setActiveTab('editor')}
            >
              <i className="fas fa-code"></i> Editor
            </button>
            <button 
              className={activeTab === 'samples' ? 'active' : ''}
              onClick={() => setActiveTab('samples')}
            >
              <i className="fas fa-shapes"></i> Samples
            </button>
            <button 
              className={activeTab === 'history' ? 'active' : ''}
              onClick={() => setActiveTab('history')}
            >
              <i className="fas fa-history"></i> History
            </button>
          </div>

          <div className="sidebar-content">
            {activeTab === 'editor' && (
              <div className="editor-panel">
                <textarea
                  value={gcodeInput}
                  onChange={(e) => setGcodeInput(e.target.value)}
                  placeholder="Enter your G-code here..."
                  className="gcode-editor"
                  spellCheck="false"
                />
                {error && <div className="error-message">{error}</div>}
                <div className="editor-actions">
                  <button 
                    onClick={handleRun}
                    className={isPlaying ? 'pause' : 'run'}
                  >
                    <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
                    {isPlaying ? 'Pause' : 'Run'}
                  </button>
                  <button onClick={handleReset}>
                    <i className="fas fa-undo"></i> Reset
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'samples' && (
              <div className="samples-panel">
                <h3>Sample Programs</h3>
                <div className="sample-list">
                  {Object.entries(samples).map(([name, code]) => (
                    <div 
                      key={name} 
                      className="sample-item"
                      onClick={() => handleSampleRun(name)}
                    >
                      <div className="sample-name">{name}</div>
                      <div className="sample-preview">
                        {code.split('\n')[0]}...
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="history-panel">
                <h3>Program History</h3>
                {commandHistory.length === 0 ? (
                  <div className="empty-history">No programs in history</div>
                ) : (
                  <div className="history-list">
                    {commandHistory.map((program, index) => (
                      <div key={index} className="history-item">
                        <div 
                          className="history-content"
                          onClick={() => handleLoadFromHistory(index)}
                        >
                          <div className="history-name">{program.name}</div>
                          <div className="history-time">
                            {program.timestamp.toLocaleString()}
                          </div>
                          <div className="history-preview">
                            {program.gcode.split('\n')[0].substring(0, 30)}...
                          </div>
                        </div>
                        <button 
                          className="delete-history"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteHistoryItem(index);
                          }}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="main-content">
          <div className="canvas-container">
            <canvas ref={canvasRef}></canvas>
            {showCoordinates && (
              <div className="coordinates-display">
                <div className="coordinate">
                  <span>X:</span>
                  {commands.length > 0 && currentCommandIndex > 0 && (
                    <span>{commands[currentCommandIndex - 1]?.params.X?.toFixed(2) || '0.00'}</span>
                  )}
                </div>
                <div className="coordinate">
                  <span>Y:</span>
                  {commands.length > 0 && currentCommandIndex > 0 && (
                    <span>{commands[currentCommandIndex - 1]?.params.Y?.toFixed(2) || '0.00'}</span>
                  )}
                </div>
                <div className="coordinate">
                  <span>Z:</span>
                  {commands.length > 0 && currentCommandIndex > 0 && (
                    <span>{commands[currentCommandIndex - 1]?.params.Z?.toFixed(2) || '0.00'}</span>
                  )}
                </div>
              </div>
            )}
            <div className="simulation-progress">
              <div 
                className="progress-bar"
                style={{ width: `${simulationProgress}%` }}
              ></div>
              <div className="progress-text">
                {currentCommandIndex} / {commands.length} commands ({simulationProgress}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="help-modal" onClick={(e) => handleModalClick(e, 'help')}>
          <div className="help-content" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <h2>CNC G-Code Simulator Help</h2>
              <button onClick={() => setShowHelp(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="help-body">
              <h3>Supported G-Code Commands</h3>
              <ul>
                <li><strong>G0</strong> - Rapid movement</li>
                <li><strong>G1</strong> - Linear interpolation</li>
                <li><strong>G2</strong> - Clockwise circular interpolation</li>
                <li><strong>G3</strong> - Counter-clockwise circular interpolation</li>
              </ul>
              
              <h3>How to Use</h3>
              <ol>
                <li>Enter your G-code in the editor or select a sample program</li>
                <li>Adjust settings like work area and tool diameter if needed</li>
                <li>Click "Run" to start the simulation</li>
                <li>Use "Pause" to stop the simulation temporarily</li>
                <li>"Reset" clears the simulation and returns to initial state</li>
              </ol>
              
              <h3>Tips</h3>
              <ul>
                <li>Use the speed slider to adjust simulation speed</li>
                <li>Save your programs to history for later use</li>
                <li>Download the image or G-code file for sharing</li>
                <li>Adjust tool diameter to see the actual cut width</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-modal" onClick={(e) => handleModalClick(e, 'settings')}>
          <div className="settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2>Simulation Settings</h2>
              <button onClick={() => setShowSettings(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="settings-body">
              <div className="setting-group">
                <h4>Visual Settings</h4>
                <div className="setting">
                  <label>Pen Color</label>
                  <input 
                    type="color" 
                    value={penColor} 
                    onChange={(e) => setPenColor(e.target.value)} 
                  />
                </div>
                <div className="setting">
                  <label>Background Color</label>
                  <input 
                    type="color" 
                    value={bgColor} 
                    onChange={(e) => setBgColor(e.target.value)} 
                  />
                </div>
                <div className="setting">
                  <label>Grid Color</label>
                  <input 
                    type="color" 
                    value={gridColor} 
                    onChange={(e) => setGridColor(e.target.value)} 
                  />
                </div>
              </div>
              
              <div className="setting-group">
                <h4>Machine Settings</h4>
                <div className="setting">
                  <label>Work Area Width (mm)</label>
                  <input 
                    type="number" 
                    value={workArea.width}
                    onChange={(e) => handleWorkAreaChange('width', e.target.value)}
                    min="50"
                    max="1000"
                  />
                </div>
                <div className="setting">
                  <label>Work Area Height (mm)</label>
                  <input 
                    type="number" 
                    value={workArea.height}
                    onChange={(e) => handleWorkAreaChange('height', e.target.value)}
                    min="50"
                    max="1000"
                  />
                </div>
                <div className="setting">
                  <label>Tool Diameter (px)</label>
                  <input 
                    type="number" 
                    value={toolDiameter}
                    onChange={(e) => setToolDiameter(parseInt(e.target.value) || 1)}
                    min="1"
                    max="20"
                  />
                </div>
              </div>
              
              <div className="setting-group">
                <h4>Simulation Controls</h4>
                <div className="setting">
                  <label>Speed: {speed}ms/command</label>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="10"
                    value={speed}
                    onChange={(e) => setSpeed(parseInt(e.target.value))}
                  />
                </div>
                <div className="setting">
                  <label>
                    <input
                      type="checkbox"
                      checked={showCoordinates}
                      onChange={(e) => setShowCoordinates(e.target.checked)}
                    />
                    Show Coordinates
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>CNC G-Code Simulator v2.1 | © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default CNC;