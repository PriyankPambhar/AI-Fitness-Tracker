import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Target, Droplet, Footprints, Flame, Utensils, BrainCircuit, Download, Plus, Trash2, Zap, FileDown } from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// PDF Generation Libraries are accessed via the window object in this environment

// --- INITIAL EMPTY DATA STRUCTURE ---
const emptyData = {
    profile: {
        name: 'User'
    },
    workouts: [],
    nutrition: [],
    habits: [],
    trends: [],
    goals: {
        weight: 0,
        bodyFat: 0,
        type: 'Not Set'
    },
    aiInsights: ["Log a workout and a meal to start getting personalized insights!"]
};

const COLORS = {
    protein: '#3b82f6',
    carbs: '#f97316',
    fats: '#facc15'
};

// --- MAIN APP COMPONENT ---
export default function App() {
    // --- STATE MANAGEMENT ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const [data, setData] = useState(emptyData);
    const [showWorkoutForm, setShowWorkoutForm] = useState(false);
    const [showNutritionForm, setShowNutritionForm] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);
    
    // --- FIREBASE INITIALIZATION & AUTH ---
    useEffect(() => {
        if (!window.firebaseApp) {
            try {
                const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
                const app = initializeApp(firebaseConfig);
                window.firebaseApp = app;
            } catch (e) {
                console.error("Firebase initialization error:", e);
                setIsLoading(false);
                return;
            }
        }
        
        const app = window.firebaseApp;
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        setAuth(authInstance);
        setDb(dbInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                 try {
                    await signInAnonymously(authInstance);
                 } catch (error) {
                    console.error("Anonymous sign-in error", error);
                 }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    // --- FIRESTORE DATA SYNC ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const docRef = doc(db, 'artifacts', appId, 'users', userId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const firestoreData = docSnap.data();
                if (!Array.isArray(firestoreData.aiInsights)) {
                    firestoreData.aiInsights = [firestoreData.aiInsights || "Log data to see insights."];
                }
                setData(firestoreData);
                setShowSetupModal(false);
            } else {
                // New user, show the setup modal
                setShowSetupModal(true);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Firestore snapshot error:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, userId]);

    // --- DATA PERSISTENCE ---
    const updateDataInFirestore = async (newData) => {
        setData(newData); // Optimistic UI update
        if (!db || !userId) return;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const docRef = doc(db, 'artifacts', appId, 'users', userId);
        try {
            await setDoc(docRef, newData, { merge: true });
        } catch (error) {
            console.error("Error updating Firestore:", error);
        }
    };

    // --- GEMINI API INTEGRATION ---
    const generateInsights = async () => {
        if (data.workouts.length < 1 || data.nutrition.length < 1) return;
        setIsGeneratingInsights(true);
        const apiKey = ""; // Use the API key from the environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const lastTrend = data.trends[data.trends.length - 1] || {};
        const prompt = `You are an expert AI fitness coach. Analyze the following user data for ${data.profile.name} and provide 2-3 concise, actionable, and encouraging insights in a single block of text, with each insight separated by a newline. - Primary Goal: ${data.goals.type} - Current Weight: ${lastTrend.weight || 'N/A'} kg (Goal: ${data.goals.weight} kg) - Workout Streak: ${processedData.workoutStreak} days - Average Daily Calorie Intake: ${Math.round(processedData.avgDailyCalories)} kcal - Average Daily Calories Burned (from workouts): ${Math.round(processedData.avgCaloriesBurned)} kcal - Recent Workouts: ${data.workouts.slice(-3).map(w => w.name).join(', ')} Based on this data, provide personalized advice.`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            const newInsights = text.split('\n').filter(insight => insight.trim() !== '');
            updateDataInFirestore({ ...data, aiInsights: newInsights });
        } catch (error) {
            console.error("Error generating insights:", error);
            updateDataInFirestore({ ...data, aiInsights: ["Sorry, I couldn't generate insights right now. Please try again later."] });
        } finally {
            setIsGeneratingInsights(false);
        }
    };

    // --- PDF REPORT GENERATION ---
    const generatePDFReport = async () => {
        if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
            alert("PDF generation libraries are not loaded. Please try again later.");
            return;
        }
        setIsGeneratingPDF(true);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const addImageToPdf = async (elementId, yPosition) => {
            const element = document.getElementById(elementId);
            if (!element) return yPosition;
            const canvas = await window.html2canvas(element, { backgroundColor: '#1f2937' });
            const imgData = canvas.toDataURL('image/png');
            const imgProps = doc.getImageProperties(imgData);
            const pdfWidth = doc.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            doc.addImage(imgData, 'PNG', 10, yPosition, pdfWidth - 20, pdfHeight);
            return yPosition + pdfHeight + 10;
        };

        // Title Page
        doc.setFontSize(22);
        doc.text(`Fitness Report for ${data.profile.name}`, 10, 20);
        doc.setFontSize(12);
        doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, 10, 30);
        doc.autoTable({
            startY: 40,
            head: [['Goal Type', 'Current Weight (kg)', 'Goal Weight (kg)', 'Current Body Fat (%)', 'Goal Body Fat (%)']],
            body: [[data.goals.type, data.trends[data.trends.length - 1]?.weight || 'N/A', data.goals.weight, data.trends[data.trends.length - 1]?.bodyFat || 'N/A', data.goals.bodyFat]],
        });
        
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Visual Analytics', 10, 20);
        let currentY = 30;
        currentY = await addImageToPdf('calories-chart-card', currentY);
        currentY = await addImageToPdf('weight-trend-card', currentY);
        
        doc.addPage();
        currentY = 20;
        currentY = await addImageToPdf('frequency-chart-card', currentY);
        currentY = await addImageToPdf('macro-chart-card', currentY);

        // Add Data Tables
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Workout Log', 10, 20);
        doc.autoTable({
            startY: 30,
            head: [['Date', 'Exercise', 'Sets', 'Reps', 'Weight (kg)', 'Duration (min)', 'Calories']],
            body: data.workouts.map(w => [w.date, w.name, w.sets, w.reps, w.weight, w.duration, w.calories]),
        });
        
        doc.addPage();
        doc.setFontSize(16);
        doc.text('Nutrition Log', 10, 20);
        doc.autoTable({
            startY: 30,
            head: [['Date', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fats (g)']],
            body: data.nutrition.map(n => [n.date, n.calories, n.protein, n.carbs, n.fats]),
        });

        doc.save(`Fitness_Report_${data.profile.name.replace(' ', '_')}.pdf`);
        setIsGeneratingPDF(false);
    };


    // --- DATA HANDLERS ---
    const handleSetupSubmit = (setupData) => {
        const today = new Date().toISOString().split('T')[0];
        const newData = {
            ...emptyData,
            profile: {
                name: setupData.name,
            },
            goals: {
                weight: parseFloat(setupData.goalWeight),
                bodyFat: parseFloat(setupData.goalBodyFat),
                type: setupData.goalType,
            },
            trends: [
                {
                    date: today,
                    weight: parseFloat(setupData.currentWeight),
                    bodyFat: parseFloat(setupData.currentBodyFat),
                }
            ]
        };
        updateDataInFirestore(newData);
        setShowSetupModal(false);
    };

    const addWorkout = (workout) => {
        const newWorkout = { ...workout, id: Date.now() };
        updateDataInFirestore({ ...data, workouts: [...data.workouts, newWorkout] });
        setShowWorkoutForm(false);
    };

    const addNutrition = (nutrition) => {
        const newNutrition = { ...nutrition, id: Date.now() };
        updateDataInFirestore({ ...data, nutrition: [...data.nutrition, newNutrition] });
        setShowNutritionForm(false);
    };
    
    const deleteItem = (type, id) => {
        if(window.confirm('Are you sure you want to delete this item?')){
            const updatedItems = data[type].filter(item => item.id !== id);
            updateDataInFirestore({ ...data, [type]: updatedItems });
        }
    };

    // --- DATA PROCESSING & ANALYSIS (MEMOIZED) ---
    const processedData = useMemo(() => {
        const workoutFrequency = data.workouts.reduce((acc, workout) => {
            const date = new Date(workout.date).toLocaleDateString('en-US', { weekday: 'short' });
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});
        const chartFrequencyData = Object.keys(workoutFrequency).map(day => ({ day, workouts: workoutFrequency[day] }));
        const calorieData = data.nutrition.map(log => {
            const workoutOnDate = data.workouts.find(w => new Date(w.date).toDateString() === new Date(log.date).toDateString());
            return { date: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), consumed: log.calories, burned: workoutOnDate ? workoutOnDate.calories : 0, };
        });
        const latestNutrition = data.nutrition.length > 0 ? data.nutrition[data.nutrition.length - 1] : { protein: 0, carbs: 0, fats: 0 };
        const macroData = [ { name: 'Protein', value: latestNutrition.protein }, { name: 'Carbs', value: latestNutrition.carbs }, { name: 'Fats', value: latestNutrition.fats }, ];
        const weightTrendData = data.trends.map(t => ({ date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), weight: t.weight, goal: data.goals.weight, }));
        const totalCaloriesBurned = data.workouts.reduce((sum, w) => sum + w.calories, 0);
        const avgCaloriesBurned = data.workouts.length > 0 ? totalCaloriesBurned / data.workouts.length : 0;
        const avgDailyCalories = data.nutrition.length > 0 ? data.nutrition.reduce((sum, n) => sum + n.calories, 0) / data.nutrition.length : 0;
        const workoutStreak = calculateStreak(data.workouts.map(w => w.date));
        return { chartFrequencyData, calorieData, macroData, weightTrendData, totalCaloriesBurned, avgDailyCalories, workoutStreak, avgCaloriesBurned };
    }, [data]);
    
    // --- HELPER FUNCTIONS ---
    function calculateStreak(dates) {
        if (dates.length === 0) return 0;
        const sortedDates = dates.map(d => new Date(d)).sort((a, b) => b - a);
        let streak = 0;
        if (sortedDates.length > 0) {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (sortedDates[0].toDateString() === today.toDateString() || sortedDates[0].toDateString() === yesterday.toDateString()) {
                streak = 1;
                let lastDate = sortedDates[0];
                for (let i = 1; i < sortedDates.length; i++) {
                    const currentDate = sortedDates[i];
                    const diffDays = (lastDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24);
                    if (diffDays > 0 && diffDays <= 1.5) { streak++; } else if (diffDays > 1.5) { break; }
                    lastDate = currentDate;
                }
            }
        }
        return streak;
    }
    
    if (isLoading || !isAuthReady) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
                <div className="text-center">
                    <BrainCircuit className="w-16 h-16 mx-auto mb-4 animate-pulse text-blue-400" />
                    <h1 className="text-2xl font-bold">Initializing AI Fitness Bot...</h1>
                </div>
            </div>
        );
    }

    // --- RENDER ---
    return (
        <div className="bg-gray-900 text-gray-200 min-h-screen font-sans">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                
                {showSetupModal && <SetupModal onSubmit={handleSetupSubmit} />}

                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <div className="flex items-center mb-4 sm:mb-0">
                        <BrainCircuit className="w-10 h-10 text-blue-400 mr-3" />
                        <div>
                            <h1 className="text-3xl font-bold text-white">Welcome, {data.profile.name}!</h1>
                            <p className="text-gray-400">Your personalized progress and insights hub.</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap gap-2">
                        <button onClick={() => setShowWorkoutForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors"><Plus size={18} className="mr-2"/>Log Workout</button>
                        <button onClick={() => setShowNutritionForm(true)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors"><Plus size={18} className="mr-2"/>Log Nutrition</button>
                        <button onClick={generatePDFReport} disabled={isGeneratingPDF} className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors">
                            <FileDown size={18} className="mr-2"/>{isGeneratingPDF ? 'Generating...' : 'Download Report'}
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <DashboardCard title="Key Metrics">
                            <div className="grid grid-cols-2 gap-4 text-center">
                                <Metric value={processedData.workoutStreak} label="Workout Streak" icon={<Flame className="text-orange-400"/>} unit="days"/>
                                <Metric value={data.habits[data.habits.length - 1]?.steps || 0} label="Today's Steps" icon={<Footprints className="text-sky-400"/>} />
                                <Metric value={Math.round(processedData.avgDailyCalories)} label="Avg. Cal Intake" icon={<Utensils className="text-yellow-400"/>} />
                                <Metric value={data.habits[data.habits.length - 1]?.water || 0} label="Water Intake" icon={<Droplet className="text-blue-400"/>} unit="glasses"/>
                            </div>
                        </DashboardCard>
                        <DashboardCard title="Fitness Goals">
                            <div className="space-y-3">
                                <GoalProgress label="Weight" current={data.trends[data.trends.length - 1]?.weight || 0} goal={data.goals.weight} unit="kg" />
                                <GoalProgress label="Body Fat" current={data.trends[data.trends.length - 1]?.bodyFat || 0} goal={data.goals.bodyFat} unit="%" />
                                <div className="text-center mt-4">
                                    <span className="text-sm font-medium text-gray-400">Primary Goal:</span>
                                    <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-900 text-blue-300"><Target size={14} className="mr-2"/>{data.goals.type}</span>
                                </div>
                            </div>
                        </DashboardCard>
                        <DashboardCard title="AI-Powered Insights">
                            <div className="space-y-3">
                                {isGeneratingInsights ? ( <div className="flex items-center justify-center text-gray-400"><Zap className="w-5 h-5 mr-2 animate-pulse" /><span>Generating new insights...</span></div> ) : ( (data.aiInsights || []).map((insight, index) => ( <p key={index} className="text-sm text-gray-300 bg-gray-800/50 p-3 rounded-lg border-l-4 border-blue-400">{insight}</p> )) )}
                            </div>
                             <button onClick={generateInsights} disabled={isGeneratingInsights} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center transition-colors">
                                <Zap size={18} className="mr-2"/>{isGeneratingInsights ? 'Analyzing...' : 'Generate New Insights'}
                            </button>
                        </DashboardCard>
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                        <DashboardCard title="Calories: Consumed vs. Burned" id="calories-chart-card">
                            <ChartContainer><LineChart data={processedData.calorieData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" /><XAxis dataKey="date" stroke="#9ca3af" fontSize={12} /><YAxis stroke="#9ca3af" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/><Legend /><Line type="monotone" dataKey="consumed" stroke="#f97316" strokeWidth={2} name="Consumed"/><Line type="monotone" dataKey="burned" stroke="#3b82f6" strokeWidth={2} name="Burned"/></LineChart></ChartContainer>
                        </DashboardCard>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <DashboardCard title="Workout Frequency" id="frequency-chart-card">
                                <ChartContainer><BarChart data={processedData.chartFrequencyData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" /><XAxis dataKey="day" stroke="#9ca3af" fontSize={12} /><YAxis stroke="#9ca3af" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/><Bar dataKey="workouts" fill="#3b82f6" name="Workouts" /></BarChart></ChartContainer>
                            </DashboardCard>
                             <DashboardCard title="Latest Macro Breakdown (grams)" id="macro-chart-card">
                                <ChartContainer><PieChart><Pie data={processedData.macroData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{(processedData.macroData || []).map((entry, index) => ( <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase()]} /> ))}</Pie><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} /><Legend /></PieChart></ChartContainer>
                            </DashboardCard>
                        </div>
                         <DashboardCard title="Weight Trend (kg)" id="weight-trend-card">
                            <ChartContainer><LineChart data={processedData.weightTrendData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" /><XAxis dataKey="date" stroke="#9ca3af" fontSize={12} /><YAxis stroke="#9ca3af" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']}/><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/><Legend /><Line type="monotone" dataKey="weight" stroke="#84cc16" strokeWidth={2} name="Your Weight"/><Line type="monotone" dataKey="goal" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} name="Goal Weight"/></LineChart></ChartContainer>
                        </DashboardCard>
                    </div>
                </div>
                <div className="mt-8">
                   <DataList title="Workout Log" data={data.workouts} onDelete={(id) => deleteItem('workouts', id)} columns={[ { key: 'date', name: 'Date' }, { key: 'name', name: 'Exercise' }, { key: 'sets', name: 'Sets' }, { key: 'reps', name: 'Reps' }, { key: 'weight', name: 'Weight (kg)' }, { key: 'duration', name: 'Duration (min)' }, { key: 'calories', name: 'Calories Burned' } ]}/>
                </div>
                 <div className="mt-8">
                   <DataList title="Nutrition Log" data={data.nutrition} onDelete={(id) => deleteItem('nutrition', id)} columns={[ { key: 'date', name: 'Date' }, { key: 'calories', name: 'Calories' }, { key: 'protein', name: 'Protein (g)' }, { key: 'carbs', name: 'Carbs (g)' }, { key: 'fats', name: 'Fats (g)' } ]}/>
                </div>
                {showWorkoutForm && <WorkoutForm onAdd={addWorkout} onCancel={() => setShowWorkoutForm(false)} />}
                {showNutritionForm && <NutritionForm onAdd={addNutrition} onCancel={() => setShowNutritionForm(false)} />}
            </div>
        </div>
    );
}

// --- SUB-COMPONENTS ---
const DashboardCard = ({ title, children, id }) => ( <div id={id} className="bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700/50 shadow-lg"><h2 className="text-lg font-bold text-white mb-4">{title}</h2>{children}</div>);
const ChartContainer = ({ children }) => ( <div className="w-full h-64"><ResponsiveContainer>{children}</ResponsiveContainer></div>);
const Metric = ({ value, label, icon, unit }) => ( <div className="flex flex-col items-center p-2"><div className="flex items-center justify-center h-10 w-10 rounded-full bg-gray-700 mb-2">{icon}</div><span className="text-2xl font-bold text-white">{value}{unit && <span className="text-base font-normal text-gray-400 ml-1">{unit}</span>}</span><span className="text-xs text-gray-400">{label}</span></div>);
const GoalProgress = ({ label, current, goal, unit }) => { const progressToGoal = goal > 0 ? Math.min((current / goal) * 100, 100) : 0; return ( <div><div className="flex justify-between items-baseline mb-1"><span className="text-sm font-medium text-gray-300">{label}</span><span className="text-xs text-gray-400">{current || 'N/A'}{unit} / <span className="font-bold text-white">{goal || 'N/A'}{unit}</span></span></div><div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden"><div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${progressToGoal}%` }}></div></div></div> );};
const DataList = ({ title, data, columns, onDelete }) => ( <DashboardCard title={title}><div className="overflow-x-auto"><table className="w-full text-sm text-left text-gray-400"><thead className="text-xs text-gray-300 uppercase bg-gray-700/50"><tr>{columns.map(col => <th key={col.key} scope="col" className="px-4 py-3">{col.name}</th>)}<th scope="col" className="px-4 py-3">Actions</th></tr></thead><tbody>{data.length > 0 ? data.slice().reverse().map(item => ( <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-700/30">{columns.map(col => <td key={col.key} className="px-4 py-3">{item[col.key]}</td>)}<td className="px-4 py-3"><button onClick={() => onDelete(item.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button></td></tr> )) : ( <tr><td colSpan={columns.length + 1} className="text-center py-4 text-gray-500">No data logged yet.</td></tr> )}</tbody></table></div></DashboardCard>);
const FormModal = ({ children, title, onCancel }) => ( <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-8 w-full max-w-md m-4 border border-gray-700"><h2 className="text-2xl font-bold text-white mb-6">{title}</h2>{children}</div></div>);
const InputField = ({ label, type, value, onChange, placeholder, name }) => ( <div><label className="block mb-2 text-sm font-medium text-gray-300">{label}</label><input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} required className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" /></div>);
const SelectField = ({ label, name, value, onChange, children }) => ( <div><label className="block mb-2 text-sm font-medium text-gray-300">{label}</label><select name={name} value={value} onChange={onChange} required className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">{children}</select></div>);

const SetupModal = ({ onSubmit }) => {
    const [formState, setFormState] = useState({ name: '', goalType: 'Fat Loss', currentWeight: '', goalWeight: '', currentBodyFat: '', goalBodyFat: '', });
    const handleChange = (e) => setFormState({ ...formState, [e.target.name]: e.target.value });
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(formState); };
    return (
        <FormModal title="Welcome! Let's Set Up Your Profile.">
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-gray-400 text-sm mb-4">Tell us about your goals and current stats to get started.</p>
                <InputField label="What's Your Name?" type="text" name="name" value={formState.name} onChange={handleChange} placeholder="e.g., Alex Doe" />
                <SelectField label="What is your primary goal?" name="goalType" value={formState.goalType} onChange={handleChange}><option>Fat Loss</option><option>Muscle Gain</option><option>Endurance</option><option>Maintenance</option></SelectField>
                <div className="grid grid-cols-2 gap-4"><InputField label="Current Weight (kg)" type="number" name="currentWeight" value={formState.currentWeight} onChange={handleChange} placeholder="85" /><InputField label="Goal Weight (kg)" type="number" name="goalWeight" value={formState.goalWeight} onChange={handleChange} placeholder="80" /></div>
                <div className="grid grid-cols-2 gap-4"><InputField label="Current Body Fat (%)" type="number" name="currentBodyFat" value={formState.currentBodyFat} onChange={handleChange} placeholder="20" /><InputField label="Goal Body Fat (%)" type="number" name="goalBodyFat" value={formState.goalBodyFat} onChange={handleChange} placeholder="15" /></div>
                <div className="flex justify-end pt-4"><button type="submit" className="w-full text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center">Save & Start Tracking</button></div>
            </form>
        </FormModal>
    );
};

const WorkoutForm = ({ onAdd, onCancel }) => {
    const [formState, setFormState] = useState({ date: new Date().toISOString().split('T')[0], name: '', sets: '', reps: '', weight: '', duration: '', calories: '' });
    const handleChange = (e) => setFormState({ ...formState, [e.target.name]: e.target.value });
    const handleSubmit = (e) => { e.preventDefault(); onAdd(formState); };
    return (
        <FormModal title="Log New Workout" onCancel={onCancel}><form onSubmit={handleSubmit} className="space-y-4"><InputField label="Date" type="date" name="date" value={formState.date} onChange={handleChange} /><InputField label="Exercise Name" type="text" name="name" value={formState.name} onChange={handleChange} placeholder="e.g., Bench Press" /><div className="grid grid-cols-2 gap-4"><InputField label="Sets" type="number" name="sets" value={formState.sets} onChange={handleChange} placeholder="3" /><InputField label="Reps" type="number" name="reps" value={formState.reps} onChange={handleChange} placeholder="10" /></div><div className="grid grid-cols-2 gap-4"><InputField label="Weight (kg)" type="number" name="weight" value={formState.weight} onChange={handleChange} placeholder="60" /><InputField label="Duration (min)" type="number" name="duration" value={formState.duration} onChange={handleChange} placeholder="45" /></div><InputField label="Calories Burned" type="number" name="calories" value={formState.calories} onChange={handleChange} placeholder="250" /><div className="flex justify-end space-x-4 pt-4"><button type="button" onClick={onCancel} className="py-2 px-4 text-sm font-medium text-gray-400 bg-transparent rounded-lg border border-gray-600 hover:bg-gray-700 hover:text-white">Cancel</button><button type="submit" className="text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center">Add Workout</button></div></form></FormModal>
    );
};

const NutritionForm = ({ onAdd, onCancel }) => {
    const [formState, setFormState] = useState({ date: new Date().toISOString().split('T')[0], calories: '', protein: '', carbs: '', fats: '' });
    const handleChange = (e) => setFormState({ ...formState, [e.target.name]: e.target.value });
    const handleSubmit = (e) => { e.preventDefault(); onAdd(formState); };
    return (
        <FormModal title="Log Nutrition Intake" onCancel={onCancel}><form onSubmit={handleSubmit} className="space-y-4"><InputField label="Date" type="date" name="date" value={formState.date} onChange={handleChange} /><InputField label="Total Calories" type="number" name="calories" value={formState.calories} onChange={handleChange} placeholder="2200" /><div className="grid grid-cols-3 gap-4"><InputField label="Protein (g)" type="number" name="protein" value={formState.protein} onChange={handleChange} placeholder="150" /><InputField label="Carbs (g)" type="number" name="carbs" value={formState.carbs} onChange={handleChange} placeholder="250" /><InputField label="Fats (g)" type="number" name="fats" value={formState.fats} onChange={handleChange} placeholder="70" /></div><div className="flex justify-end space-x-4 pt-4"><button type="button" onClick={onCancel} className="py-2 px-4 text-sm font-medium text-gray-400 bg-transparent rounded-lg border border-gray-600 hover:bg-gray-700 hover:text-white">Cancel</button><button type="submit" className="text-white bg-green-600 hover:bg-green-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center">Add Intake</button></div></form></FormModal>
    );
};
